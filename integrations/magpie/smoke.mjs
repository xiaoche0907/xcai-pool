import assert from 'node:assert/strict';

const endpoint = 'http://127.0.0.1:51668/mcp/magpie/tools/xcaipool';
let id = 0;
async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer magpie',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split(/\r?\n/).find(line => line.startsWith('data: '))?.slice(6)
    : body;
  const message = JSON.parse(data);
  assert.ok(message.result, JSON.stringify(message.error));
  return message.result;
}

const list = await rpc('tools/list', {});
assert.deepEqual(list.tools.map(tool => tool.name).sort(), ['models', 'route_preview', 'schema']);
async function call(name, args) {
  const result = await rpc('tools/call', { name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result.content));
  return JSON.parse(result.content[0].text);
}
for (const type of ['image', 'video']) {
  const catalog = await call('models', { type });
  assert.ok(catalog.total > 0 && catalog.data.every(model => model.modality === type));
  console.log(`${type}: ${catalog.total}`);
}
const schema = await call('schema', { modelKey: 'z-image' });
assert.equal(schema.modelKey, 'z-image');
const route = await call('route_preview', { modelKey: 'z-image' });
assert.equal(route.modelKey, 'z-image');
assert.equal(route.generationEnabled, false);
assert.equal(route.generationPermission, 'unverified');
assert.ok(route.accounts.some(account => account.status === 'listed'));
console.log(JSON.stringify(route));
