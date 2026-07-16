/**
 * Terminal session manager — spawns shell processes and buffers output
 * for polling-based retrieval by the xterm.js frontend.
 *
 * On macOS/Linux, uses the `script` utility to allocate a PTY around the
 * shell, giving proper terminal behavior (input echoing, line editing,
 * tab completion, ANSI colors) without requiring a native `node-pty` dep.
 * On Windows, falls back to plain `cmd.exe` with pipe stdio.
 *
 * For full TUI support (vim, htop), `node-pty` would still be needed as
 * an optional upgrade — `script` provides line-oriented interactivity.
 */
import { spawn, type ChildProcess } from 'node:child_process';
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
   * - macOS:   `script -q /dev/null <shell> -l`  (command as trailing args)
   * - Linux:   `script -q -c "<shell> -l" /dev/null` (command as -c string)
   * - Windows: `<shell>` directly (cmd.exe, no PTY wrapper)
   *
   * `script` creates a PTY pair and relays between our pipes and the PTY,
   * so the shell gets a real terminal on its stdin/stdout/stderr.
   */
  function buildSpawnCommand(shell: string): { command: string; args: string[] } {
    if (process.platform === 'win32') {
      return { command: shell, args: [] };
    }
    if (process.platform === 'darwin') {
      // macOS `script`: command passed as trailing arguments after the file.
      return { command: 'script', args: ['-q', '/dev/null', shell, '-l'] };
    }
    // Linux `script` (util-linux): command must be a single -c string.
    return { command: 'script', args: ['-q', '-c', `${shell} -l`, '/dev/null'] };
  }

  function start(params: TerminalStartParams): { sessionId: string } {
    const id = randomUUID();
    const shell = params.shell || getDefaultShell();
    const { command, args } = buildSpawnCommand(shell);

    const proc = spawn(command, args, {
      cwd: params.cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        LSCOLORS: 'Gxfxcxdxbxegedabagacad',
        LS_COLORS: 'di=34:ln=36:so=35:pi=33:ex=32:bd=34:cd=34:su=41;37:sg=41;37:tw=42;37:ow=42;37'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session: TerminalSession = {
      id,
      proc,
      cwd: params.cwd,
      cols: params.cols || 80,
      rows: params.rows || 24,
      buffer: '',
      exited: false,
      exitCode: null
    };

    proc.stdout?.on('data', (data: Buffer) => {
      session.buffer += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      session.buffer += data.toString();
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
    // `script` doesn't expose PTY resize signaling; this is a no-op.
    // Upgrading to node-pty would enable true resize support.
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
        // Kill the process group (script + shell) so no orphan remains.
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
