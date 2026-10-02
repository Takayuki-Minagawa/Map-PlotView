'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadScript } = require('./helpers/load');

function newGeo(fetchImpl) {
  const sandbox = createSandbox({ fetch: fetchImpl });
  loadScript('geocode.js', sandbox);
  return sandbox.Geo;
}

function jsonResponse(body, status) {
  return Promise.resolve({
    ok: (status || 200) < 400,
    status: status || 200,
    json: () => Promise.resolve(body)
  });
}

test('parseLatLngQuery: 緯度経度の直接入力を解釈する', () => {
  const Geo = newGeo();
  assert.deepEqual(Geo.parseLatLngQuery('35.681, 139.767'), [35.681, 139.767]);
  assert.deepEqual(Geo.parseLatLngQuery(' 35.681 139.767 '), [35.681, 139.767]);
  assert.deepEqual(Geo.parseLatLngQuery('-33.86,151.21'), [-33.86, 151.21]);
  assert.deepEqual(Geo.parseLatLngQuery('139.767, 35.681'), [35.681, 139.767], '経度,緯度の順は入れ替える');
  assert.deepEqual(Geo.parseLatLngQuery('３５．６８１，１３９．７６７'), [35.681, 139.767], '全角の数字・カンマ');
  assert.deepEqual(Geo.parseLatLngQuery('35.5, 139'), [35.5, 139], '片方だけ小数でもよい');
});

test('parseLatLngQuery: 座標でない入力・範囲外はnull', () => {
  const Geo = newGeo();
  assert.equal(Geo.parseLatLngQuery('東京駅'), null);
  assert.equal(Geo.parseLatLngQuery('東京都千代田区1-2'), null);
  assert.equal(Geo.parseLatLngQuery('35.681'), null);
  assert.equal(Geo.parseLatLngQuery('200.5, 300.5'), null);
  assert.equal(Geo.parseLatLngQuery('1,000'), null, '桁区切りの数値を座標と誤認しない');
  assert.equal(Geo.parseLatLngQuery('100 0001'), null, '郵便番号を座標と誤認しない');
  assert.equal(Geo.parseLatLngQuery('1 2'), null);
  assert.equal(Geo.parseLatLngQuery(''), null);
  assert.equal(Geo.parseLatLngQuery(null), null);
});

test('parseAddressResults: GeoJSON配列を {title, lat, lng} へ変換し不正要素を捨てる', () => {
  const Geo = newGeo();
  const out = Geo.parseAddressResults([
    { geometry: { coordinates: [139.767, 35.681], type: 'Point' }, properties: { title: '東京駅' } },
    { geometry: { coordinates: ['x', 35] }, properties: { title: 'bad' } },
    { geometry: null },
    null,
    { geometry: { coordinates: [139, 35] } }
  ]);
  assert.deepEqual(out, [
    { title: '東京駅', lat: 35.681, lng: 139.767 },
    { title: '', lat: 35, lng: 139 }
  ]);
  assert.deepEqual(Geo.parseAddressResults({ error: 'x' }), [], '配列以外は空');
});

test('parseAddressResults: 件数上限で打ち切る', () => {
  const Geo = newGeo();
  const many = Array.from({ length: 50 }, (_, i) => ({
    geometry: { coordinates: [139, 35] }, properties: { title: 't' + i }
  }));
  assert.equal(Geo.parseAddressResults(many).length, 20, '既定は20件');
  assert.equal(Geo.parseAddressResults(many, 3).length, 3);
});

test('searchAddress: クエリをURLエンコードして送信し結果を返す', async () => {
  const calls = [];
  const Geo = newGeo((url) => {
    calls.push(url);
    return jsonResponse([{ geometry: { coordinates: [139.767, 35.681] }, properties: { title: '東京駅' } }]);
  });
  const out = await Geo.searchAddress(' 東京駅 ');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('?q=' + encodeURIComponent('東京駅')), calls[0]);
  assert.equal(out[0].title, '東京駅');
});

test('searchAddress: 空クエリは通信しない / HTTPエラーはreject', async () => {
  let called = 0;
  const Geo = newGeo(() => { called++; return jsonResponse([], 500); });
  assert.deepEqual(await Geo.searchAddress('   '), []);
  assert.equal(called, 0);
  await assert.rejects(() => Geo.searchAddress('x'), /HTTP 500/);
});

test('parseElevation / getElevation: 数値は採用し、データ無し("-----")はnull', async () => {
  const Geo = newGeo((url) => {
    assert.ok(url.includes('lon=139.767') && url.includes('lat=35.681') && url.includes('outtype=JSON'), url);
    return jsonResponse({ elevation: 3.5, hsrc: '1m（レーザ）' });
  });
  assert.deepEqual(await Geo.getElevation(35.681, 139.767), { elevation: 3.5, source: '1m（レーザ）' });
  assert.equal(Geo.parseElevation({ elevation: '-----', hsrc: '-----' }), null);
  assert.equal(Geo.parseElevation(null), null);
  assert.deepEqual(Geo.parseElevation({ elevation: 0 }), { elevation: 0, source: '' }, '標高0mは有効値');
});

test('parseAddressResults: 名称の一致度順に並べてから件数を絞る', () => {
  const Geo = newGeo();
  const item = title => ({ geometry: { coordinates: [139, 35] }, properties: { title } });
  const json = [];
  for (let i = 0; i < 40; i++) json.push(item('北海道東' + i + '町'));
  json.push(item('新東京駅前'), item('東京駅北口'), item('東京駅'));
  const out = Geo.parseAddressResults(json, 5, '東京駅');
  assert.deepEqual(out.map(r => r.title), ['東京駅', '東京駅北口', '新東京駅前', '北海道東0町', '北海道東1町'],
    '完全一致 → 前方一致 → 部分一致 → その他（元の順）');
  assert.equal(Geo.parseAddressResults(json, 5)[0].title, '北海道東0町', 'クエリ無しなら元の順');
});

test('searchAddress: 後方に埋もれた本命を先頭に返す', async () => {
  const body = [];
  for (let i = 0; i < 49; i++) body.push({ geometry: { coordinates: [141, 43] }, properties: { title: '北海道東' + i } });
  body.push({ geometry: { coordinates: [139.767, 35.681] }, properties: { title: '東京駅' } });
  const Geo = newGeo(() => jsonResponse(body));
  const out = await Geo.searchAddress('東京駅');
  assert.equal(out.length, 20);
  assert.equal(out[0].title, '東京駅');
});
