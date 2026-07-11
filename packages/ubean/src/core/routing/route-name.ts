import { pascalCase } from 'scule';

export function generateRouteName(routePath: string): string {
  if (routePath === '/' || routePath === '') {
    return 'index';
  }

  const segments = routePath.replace(/^\//, '').replace(/\/$/, '').split('/');

  const nameSegments: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }

    if (segment.startsWith('[...')) {
      const param = segment.slice(4, -1);
      nameSegments.push(`All${formatParamName(param)}`);
      continue;
    }

    if (segment.startsWith('[[')) {
      const param = segment.slice(2, -2);
      nameSegments.push(`${formatParamName(param)}Optional`);
      continue;
    }

    if (segment.startsWith('[')) {
      const param = segment.slice(1, -1);
      nameSegments.push(formatParamName(param));
      continue;
    }

    nameSegments.push(pascalCase(segment));
  }

  const name = nameSegments.join('');
  return name || 'index';
}

export function generateLayoutName(layoutPath: string): string {
  const base = layoutPath.replace(/\.(vue|ts)$/, '');
  if (base === 'default' || base === 'default/index') {
    return 'default';
  }
  const segments = base.split('/').filter(Boolean);
  return segments.map(s => pascalCase(s)).join('');
}

export function generateApiRouteId(method: string, routePath: string): string {
  const routeName = generateRouteName(routePath);
  return `${method.toLowerCase()}${routeName}`;
}

function formatParamName(param: string): string {
  const cleaned = param.replace(/^\.{3}/, '').replace(/\?$/, '');
  return pascalCase(cleaned);
}
