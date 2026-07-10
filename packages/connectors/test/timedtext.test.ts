import { expect, test } from 'bun:test';
import { decodeEntities, parseTimedText } from '../src/timedtext';

test('parseTimedText parses cues with named and numeric entities', () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?><transcript>
<text start="0.16" dur="4.24">caf&#233; &amp; p&#xE3;o</text>
<text start="4.4" dur="2">&quot;it&#39;s&quot; &lt;b&gt;bold&lt;/b&gt;</text>
</transcript>`;
  expect(parseTimedText(xml)).toEqual([
    { start: 0.16, dur: 4.24, text: 'café & pão' },
    { start: 4.4, dur: 2, text: '"it\'s" <b>bold</b>' },
  ]);
});

test('parseTimedText keeps multiline cue text', () => {
  const xml = `<transcript><text start="1.5" dur="3.5">primeira linha
segunda linha</text></transcript>`;
  expect(parseTimedText(xml)).toEqual([
    { start: 1.5, dur: 3.5, text: 'primeira linha\nsegunda linha' },
  ]);
});

test('parseTimedText handles attribute order variations and missing dur', () => {
  const xml =
    '<transcript><text dur="2.5" start="10">a</text><text start="12.5">b</text></transcript>';
  expect(parseTimedText(xml)).toEqual([
    { start: 10, dur: 2.5, text: 'a' },
    { start: 12.5, dur: 0, text: 'b' },
  ]);
});

test('parseTimedText skips cues without a valid start and empty cues', () => {
  const xml =
    '<transcript><text dur="2">sem start</text><text start="1" dur="2">   </text><text start="3" dur="1">ok</text></transcript>';
  expect(parseTimedText(xml)).toEqual([{ start: 3, dur: 1, text: 'ok' }]);
});

test('parseTimedText returns [] for empty or cue-less xml', () => {
  expect(parseTimedText('')).toEqual([]);
  expect(
    parseTimedText('<?xml version="1.0" encoding="utf-8" ?><transcript></transcript>'),
  ).toEqual([]);
});

test('decodeEntities decodes the supported set and leaves the rest untouched', () => {
  expect(decodeEntities('&amp;&lt;&gt;&quot;&#39;&apos;')).toBe("&<>\"''");
  expect(decodeEntities('&#65;&#x42;')).toBe('AB');
  expect(decodeEntities('&eacute; &unknown; &#99999999999;')).toBe(
    '&eacute; &unknown; &#99999999999;',
  );
});
