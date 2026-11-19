import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Podium } = await import('../frontend/app/Podium.tsx');

test('el podio ordena por puntos y muestra coronas solo en los primeros tres lugares', () => {
  const players = [
    { id: '4', username: 'Dani', score: 0 },
    { id: '2', username: 'Beto', score: 2 },
    { id: '1', username: 'Ana', score: 4 },
    { id: '3', username: 'Caro', score: 1 },
  ];
  const html = renderToStaticMarkup(React.createElement(Podium, { players }));

  assert.match(html, /Primer lugar, corona de oro/);
  assert.match(html, /Segundo lugar, corona de plata/);
  assert.match(html, /Tercer lugar, corona de bronce/);
  assert.match(html, /aria-label="Primer lugar, corona de oro"[^>]*text-yellow-400/);
  assert.match(html, /aria-label="Segundo lugar, corona de plata"[^>]*text-slate-300/);
  assert.match(html, /aria-label="Tercer lugar, corona de bronce"[^>]*text-amber-700/);
  assert.match(html, /4\.<\/span>Dani/);
  assert.ok(html.indexOf('Ana') < html.indexOf('Beto'));
  assert.ok(html.indexOf('Beto') < html.indexOf('Caro'));
  assert.ok(html.indexOf('Caro') < html.indexOf('Dani'));
});

test('el podio admite menos de tres participantes y ordena empates por nombre', () => {
  const html = renderToStaticMarkup(React.createElement(Podium, {
    players: [
      { id: '2', username: 'Beto', score: 1 },
      { id: '1', username: 'Ana', score: 1 },
    ],
  }));
  assert.ok(html.indexOf('Ana') < html.indexOf('Beto'));
  assert.doesNotMatch(html, /Tercer lugar, corona de bronce/);
});
