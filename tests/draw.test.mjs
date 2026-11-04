import test from 'node:test';
import assert from 'node:assert/strict';

// Echivalentul în JavaScript al rotației folosite de funcția SQL.
function allocate(faculties){
  const max = Math.max(...Object.values(Object.groupBy(faculties,x=>x)).map(a=>a.length));
  const order = faculties.map((faculty,i)=>({id:i,faculty})).sort((a,b)=>a.faculty.localeCompare(b.faculty));
  const n=order.length;
  const shift=Math.min(max,n-1);
  const pairs=order.map((giver,i)=>({giver,recipient:order[(i+shift)%n]}));
  return pairs;
}
function verify(faculties){
  const pairs=allocate(faculties);
  assert.equal(new Set(pairs.map(x=>x.recipient.id)).size,faculties.length);
  assert.ok(pairs.every(x=>x.giver.id!==x.recipient.id));
  const max = Math.max(...Object.values(Object.groupBy(faculties,x=>x)).map(a=>a.length));
  if(max<=faculties.length/2) assert.ok(pairs.every(x=>x.giver.faculty!==x.recipient.faculty));
  const expectedSame=Math.max(0,2*max-faculties.length);
  assert.equal(pairs.filter(x=>x.giver.faculty===x.recipient.faculty).length,expectedSame);
}
test('2-20 persoane, grupe de facultăți diferite',()=>{
  for(let n=2;n<=20;n++){
    for(let k=1;k<=n;k++){
      for(let repeat=0;repeat<30;repeat++){
        const faculties=Array.from({length:n},(_,i)=>String.fromCharCode(65+((i*17+repeat*7)%k)));
        verify(faculties);
      }
    }
  }
});
test('cazuri limită',()=>{
  verify(['A','A']);verify(['A','B']);verify(['A','A','B']);verify(['A','A','B','B']);
  verify(['A','A','A','A','B','C']);verify(['A','A','A','A','B','B','C','C']);
});
