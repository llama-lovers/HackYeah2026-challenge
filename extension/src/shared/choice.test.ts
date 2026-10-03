import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const c: any = existsSync(new URL('./choice.ts', import.meta.url)) ? await import('./choice.ts') : {};
const node = (id: string, extra = {}) => ({kind:'interactive', id, role:'button', name:'Szczegóły ' + id, ...extra});
export const choiceSnapshot: any = {epoch:7, path:'/', title:'T', truncated:false, nodes:[node('e1'), node('e2'), node('e3'), node('e4'), node('e5',{state:{disabled:true}}), node('e6',{role:'textbox'}), node('e7',{kind:'text'}), node('e8',{role:'textbox',state:{sensitive:true}})]};
test('duplicate guard preserves DOM order includes the target and disambiguates by heading', () => {
  const s = {...choiceSnapshot,nodes:['Krakowa','Gdańska','Poznania','Łodzi'].flatMap((city,i)=>[{kind:'heading',role:'heading',name:'Paczka z '+city},node('e'+(i+1),{name:'Usuń'})])};
  assert.deepEqual(c.duplicateOptions?.(s,'e1')?.map((o:any)=>[o.id,o.context]),[['e1','Paczka z Krakowa'],['e2','Paczka z Gdańska'],['e3','Paczka z Poznania']]);
  assert.deepEqual(c.duplicateOptions(s,'e4').map((o:any)=>o.id),['e1','e2','e4']);
  assert.deepEqual(c.duplicateOptions(s,'unknown'),[]);
  const two = {...s,nodes:s.nodes.slice(0,4)};
  assert.equal(c.duplicateOptions(two,'e1').length,2);
  two.nodes[3] = node('e2',{name:' usuń '}); assert.equal(c.duplicateOptions(two,'e1').length,2);
  two.nodes[3] = node('e2',{name:'Usun'}); assert.deepEqual(c.duplicateOptions(two,'e1'),[]);
  two.nodes[3] = node('e2',{name:'Usuń',state:{disabled:true}}); assert.deepEqual(c.duplicateOptions(two,'e1'),[]);
  two.nodes[3] = node('e2',{name:'Usuń',role:'link'}); assert.deepEqual(c.duplicateOptions(two,'e1'),[]);
  const shared = {...s,nodes:[{kind:'heading',name:'Paczki',role:'heading'},node('e1',{name:'Usuń'}),node('e2',{name:'Usuń'})]};
  assert(c.duplicateOptions(shared,'e1').every((o:any)=>o.context===undefined));
  shared.nodes.shift(); assert(c.duplicateOptions(shared,'e1').every((o:any)=>o.context===undefined));
});
test('choice ids retain only enabled interactive action-compatible candidates in offered order', () => {
  assert.deepEqual(c.optionsFromIds?.(choiceSnapshot, ['e3','bad','e3','e5','e6','e7','e2','e1','e4'], 'click')?.map((o:any)=>o.id), ['e3','e2','e1']);
  assert.deepEqual(c.optionsFromIds(choiceSnapshot, ['e1','e8','e6'], 'fill').map((o:any)=>o.id), ['e6']);
  assert.equal(c.optionsFromIds(choiceSnapshot,['e1'],'click')[0].context, undefined);
});
test('choice parses folded whole utterances and reports out of range numbers', () => {
  for(const [text,n] of [['dwa',2],['Drugi.',2],['2',2],['numer dwa',2],['dwójka',2],['jeden',1],['trzecia',3]] as const) assert.equal(c.parseChoice?.(text,3),n);
  for(const text of ['cztery','5','szósty','siódma','ósme','dziewiąty','0','10']) assert.equal(c.parseChoice(text,3),'out_of_range');
  for(const text of ['kliknij Usuń','dwa proszę','numer dwa trzy']) assert.equal(c.parseChoice(text,3),null);
});
