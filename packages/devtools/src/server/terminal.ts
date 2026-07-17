/**
 * Terminal session manager — spawns shell processes and buffers output
 * for polling-based retrieval by the xterm.js frontend.
 *
 * On macOS/Linux, uses Python's `pty` module to create a real pseudo-terminal.
 * This gives the shell (bash/zsh) a proper TTY, enabling:
 *   - Input echo (characters appear as you type)
 *   - Line editing (arrow keys, Ctrl+A/E, etc.)
 *   - Tab completion
 *   - Full TUI apps (vim, htop, etc.)
 *
 * Python3 is pre-installed on macOS (via Xcode CLT) and most Linux distros.
 * If Python3 is not available, falls back to direct shell spawn without a PTY
 * (commands still execute, but without echo or line editing).
 *
 * On Windows, cmd.exe/PowerShell work natively with pipe stdio — no PTY needed.
 */
import { spawn, execSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface TerminalSession {
  id: string;
  proc: ChildProcess | null;
  cwd: string;
  cols: number;
  rows: number;
  /** Buffered stdout+stderr output waiting to be polled by the client. */
  buffer: string;
  /** Whether the underlying process has exited. */
  exited: boolean;
  exitCode: number | null;
}

export interface TerminalStartParams {
  cwd: string;
  cols?: number;
  rows?: number;
  /** Shell command; defaults to the user's default shell. */
  shell?: string;
}

export interface TerminalPollResult {
  data: string;
  exited: boolean;
  exitCode: number | null;
}

/**
 * Python one-liner that creates a PTY and spawns the given command.
 * `pty.spawn` handles fork/exec/relay: the child gets the PTY slave as its
 * controlling terminal, while the parent relays between its own stdin/stdout
 * and the PTY master. This gives the shell a real TTY with full interactive
 * features (echo, readline, TUI support).
 */
const PTY_SCRIPT = 'import pty, sys; pty.spawn(sys.argv[1:])';

let _pythonAvailable: boolean | null = null;

function isPythonAvailable(): boolean {
  if (_pythonAvailable !== null) return _pythonAvailable;
  if (process.platform === 'win32') {
    _pythonAvailable = false;
    return false;
  }
  try {
    execSync('python3 --version', { stdio: 'ignore', timeout: 3000 });
    _pythonAvailable = true;
  } catch {
    _pythonAvailable = false;
  }
  return _pythonAvailable;
}

/** Warning messages from bash/zsh when running -i without a real TTY (fallback only). */
const TTY_WARNING_RE = /^(?:bash|zsh):\s+(?:cannot set terminal process group|no job control in this shell)/;

export function createTerminalServer() {
  const sessions = new Map<string, TerminalSession>();

  function getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Build the spawn command for the current platform.
   *
   * On macOS/Linux with Python3 available: wraps the shell in `python3 -c`
   * with a `pty.spawn` script so the shell gets a real PTY. Without Python3,
   * spawns the shell directly (degraded experience: no echo, no readline).
   * On Windows: spawns cmd.exe/PowerShell directly (pipes work natively).
   */
  function buildSpawnCommand(
    shell: string,
    shellArgs: string[]
  ): { command: string; args: string[]; usingPty: boolean } {
    if (process.platform === 'win32') {
      return { command: shell, args: shellArgs, usingPty: false };
    }

    if (isPythonAvailable()) {
      return {
        command: 'python3',
        args: ['-c', PTY_SCRIPT, shell, ...shellArgs],
        usingPty: true
      };
    }

    // Fallback: direct shell spawn without a PTY.
    return { command: shell, args: shellArgs, usingPty: false };
  }

  function start(params: TerminalStartParams): { sessionId: string } {
    const id = randomUUID();
    const shell = params.shell || getDefaultShell();
    // `-i` makes bash/zsh enter interactive mode (prompt, history, etc.).
    const shellArgs = process.platform === 'win32' ? [] : ['-i'];
    const { command, args, usingPty } = buildSpawnCommand(shell, shellArgs);

    const cols = params.cols || 80;
    const rows = params.rows || 24;

    const proc = spawn(command, args, {
      cwd: params.cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        // Initial PTY size — read by the Python PTY script if it ever needs it.
        UBEAN_TERM_COLS: String(cols),
        UBEAN_TERM_ROWS: String(rows),
        LSCOLORS: 'Gxfxcxdxbxegedabagacad',
        LS_COLORS: 'di=34:ln=36:so=35:pi=33:ex=32:bd=34:cd=34:su=41;37:sg=41;37:tw=42;37:ow=42;37'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session: TerminalSession = {
      id,
      proc,
      cwd: params.cwd,
      cols,
      rows,
      buffer: '',
      exited: false,
      exitCode: null
    };

    // If we couldn't get a PTY, warn the user about degraded input.
    if (!usingPty && process.platform !== 'win32') {
      session.buffer +=
        '\x1b[33m\u26a0 Terminal running without PTY (python3 not found).\r\n' +
        '   Commands execute but input echo and line editing are disabled.\r\n' +
        '   Install python3 for full terminal support.\x1b[0m\r\n\r\n';
    }

    proc.stdout?.on('data', (data: Buffer) => {
      session.buffer += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      // Filter out TTY warnings only in the non-PTY fallback path.
      if (usingPty) {
        session.buffer += text;
      } else {
        const lines = text.split('\n').filter(line => !TTY_WARNING_RE.test(line.trim()));
        if (lines.length > 0) {
          session.buffer += lines.join('\n');
        }
      }
    });

    proc.on('exit', code => {
      session.exited = true;
      session.exitCode = code;
      session.buffer += `\r\n\x1b[2m[Process exited with code ${code}]\x1b[0m\r\n`;
    });

    proc.on('error', err => {
      session.buffer += `\r\n\x1b[31m[Error: ${err.message}]\x1b[0m\r\n`;
      session.exited = true;
      session.exitCode = -1;
    });

    sessions.set(id, session);
    return { sessionId: id };
  }

  function input(sessionId: string, data: string): boolean {
    const session = sessions.get(sessionId);
    if (!session || !session.proc || session.exited) return false;
    session.proc.stdin?.write(data);
    return true;
  }

  function resize(sessionId: string, cols: number, rows: number): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    session.cols = cols;
    session.rows = rows;
    // PTY resize would require ioctl(TIOCSWINSZ) on the PTY master fd, which
    // is not accessible from Node when using `pty.spawn`. Upgrading to
    // node-pty or a custom Python script with a control channel would enable
    // true resize. For now this is a metadata-only update.
    return true;
  }

  function poll(sessionId: string): TerminalPollResult {
    const session = sessions.get(sessionId);
    if (!session) {
      return { data: '', exited: true, exitCode: -1 };
    }
    const data = session.buffer;
    session.buffer = '';
    return { data, exited: session.exited, exitCode: session.exitCode };
  }

  function kill(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    if (session.proc && !session.exited) {
      try {
        // Send SIGTERM to the spawned process. With the Python PTY wrapper,
        // Python will terminate and the child shell will be cleaned up by
        // the kernel (SIGHUP on controlling terminal close).
        session.proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    sessions.delete(sessionId);
    return true;
  }

  function killAll() {
    for (const id of sessions.keys()) {
      kill(id);
    }
  }

  return { start, input, resize, poll, kill, killAll };
}

export type TerminalServer = ReturnType<typeof createTerminalServer>;
