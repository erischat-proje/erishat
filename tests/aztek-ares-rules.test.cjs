/* Exercise the shipped rule renderer with real legacy/current server tables. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixtures = JSON.parse(execFileSync('python3', ['-c', `
import importlib.util,json
from pathlib import Path
result={}
for version in ['v1','v2']:
    spec=importlib.util.spec_from_file_location(version,Path('backend/app')/('aztek_ares_'+version+'.py'))
    engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
    result[version]={game:engine.rules(game) for game in ['aztek','ares']}
print(json.dumps(result))
`], {cwd: root, encoding: 'utf8'}));
for (const game of ['aztek', 'ares']) {
  const source = fs.readFileSync(path.join(root, 'frontend/games', game+'.html'), 'utf8');
  const render = source.slice(source.indexOf('function renderRules('), source.indexOf('async function init()'));
  for (const version of ['v1', 'v2']) {
    const node = {innerHTML: ''};
    vm.runInNewContext(render+';renderRules(r)', {AZ:game==='aztek', r:fixtures[version][game], $:()=>node});
    assert.match(node.innerHTML, /Ödeme tablosu/);
    if (version==='v2') {
      assert.match(node.innerHTML, /%96.50/);
      assert.match(node.innerHTML, /her turda kazanma olasılığı değildir/);
      assert.match(node.innerHTML, game==='aztek' ? /Nükleer alan yenilemesi seviye sayacına eklenmez/ : /Serbest tur ödeme tablosu/);
    } else {
      assert.match(node.innerHTML, /Kalibre edilmemiş/);
      assert.doesNotMatch(node.innerHTML, /%96.50/);
    }
  }
  assert.match(source, /r=a\.rules\|\|r/);
  assert.match(source, /rules=response\.next_rules;renderRules\(rules\)/);
}
console.log('Aztek/Ares current and legacy rule rendering: 4 scenarios passed');
