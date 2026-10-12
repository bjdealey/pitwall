import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

const named = z.object({ name: z.string(), value: z.string() });
const themed = z.object({ name: z.string(), value: z.record(z.string(), z.string()) });
const tokensSchema = z.object({
  color: z.object({ themes: z.array(z.object({ id: z.string() })).min(1), tokens: z.array(themed) }),
  type: z.object({
    families: z.record(z.string(), z.string()),
    groups: z.array(
      z.object({
        family: z.string(),
        styles: z.array(z.object({ name: z.string(), fontSize: z.string(), lineHeight: z.string(), fontWeight: z.number(), letterSpacing: z.string().optional() })),
      }),
    ),
  }),
  spacing: z.object({ tokens: z.array(named) }),
  radius: z.object({ tokens: z.array(named) }),
  size: z.object({ tokens: z.array(named) }),
  shadow: z.object({ tokens: z.array(themed) }),
});

const root = new URL('..', import.meta.url);
const tokens = tokensSchema.parse(JSON.parse(readFileSync(new URL('design/tokens.json', root), 'utf8')));
const [first, ...rest] = tokens.color.themes.map((t) => t.id);

const themeVars = (theme: string, indent: string) =>
  [...tokens.color.tokens, ...tokens.shadow.tokens]
    .map((t) => {
      const value = t.value[theme];
      if (!value) throw new Error(`${t.name} has no ${theme} value`);
      return `${indent}--${t.name}: ${value};`;
    })
    .concat(`${indent}color-scheme: ${theme};`)
    .join('\n');

const staticVars = [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.size.tokens]
  .map((t) => `  --${t.name}: ${t.value};`)
  .concat(Object.entries(tokens.type.families).map(([name, stack]) => `  --font-${name}: ${stack};`))
  .join('\n');

const typeClasses = tokens.type.groups.flatMap((group) =>
  group.styles.map((s) => {
    const props = [
      `font-family: var(--font-${group.family})`,
      `font-size: ${s.fontSize}`,
      `line-height: ${s.lineHeight}`,
      `font-weight: ${s.fontWeight}`,
      ...(s.letterSpacing ? [`letter-spacing: ${s.letterSpacing}`] : []),
      ...(group.family === 'mono' ? ['font-variant-numeric: tabular-nums'] : []),
    ];
    return `.pw-${s.name} { ${props.join('; ')}; }`;
  }),
);

const css = [
  '/* Generated from design/tokens.json by `npm run tokens`. Do not edit. */',
  `:root, [data-theme="${first}"] {\n${themeVars(first ?? '', '  ')}\n}`,
  ...rest.map((theme) => `[data-theme="${theme}"] {\n${themeVars(theme, '  ')}\n}`),
  ...rest.map((theme) => `@media (prefers-color-scheme: ${theme}) {\n  :root:not([data-theme]) {\n${themeVars(theme, '    ')}\n  }\n}`),
  `:root {\n${staticVars}\n}`,
  ...typeClasses,
].join('\n\n');

writeFileSync(new URL('src/web/tokens.css', root), `${css}\n`);
console.log(`Wrote src/web/tokens.css (${tokens.color.tokens.length} colors, ${typeClasses.length} type styles)`);
