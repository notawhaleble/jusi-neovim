import assert from 'node:assert/strict';
import {connect} from 'node:net';
import {EmbeddedNvimRpcClient} from '../../dist/bridge/nvim-client.js';
import {EmbeddedNvimSession} from '../../dist/bridge/rpc-session.js';
import {NvimScreenState} from '../../dist/bridge/screen-state.js';
import {MsgpackRpc} from '../../dist/bridge/msgpack-rpc.js';
const screen=new NvimScreenState();
screen.handleRedraw([['option_set',['guifont','Example:h14'],['linespace',2],['mousehide',true],['future_option','kept']]]);
const before=screen.getState();
screen.handleRedraw([['option_set',['linespace',4],['mousehide',false],['invalid',{}],['nan',NaN]]]);
assert.equal(before.options.linespace,2);
assert.equal(screen.getState().options.linespace,4);
assert.equal(screen.getState().options.mousehide,false);
assert.equal(screen.getState().options.future_option,'kept');
assert.equal(screen.getState().options.invalid,undefined);
assert.equal(screen.getState().options.nan,undefined);

// Real negotiation: report an incompatible second UI, then recover on detach.
const client=await EmbeddedNvimRpcClient.spawn({clean:true});
const session=new EmbeddedNvimSession(client);session.start();
let socket,second;
try {
  await session.attachUi(80,24);
  const address=await client.request('nvim_exec_lua',["return vim.fn.serverstart()",[]]);
  socket=connect(address);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  second=new MsgpackRpc(socket,socket,{notification(){},request:async()=>null,close(){}},5000);
  await second.request('nvim_ui_attach',[80,24,{rgb:true,ext_linegrid:true}]);
  await client.request('nvim_command',['set linespace=3 mousehide']);
  await client.request('nvim_command',['redraw!']);
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.ok(predicate());};
  await wait(()=>session.getPresentationState().screen.options?.linespace===3);
  const options=session.getPresentationState().screen.options;
  for(const key of ['ext_cmdline','ext_popupmenu','ext_messages']) {
    assert.equal(options[key],false,`${key} records actual negotiation`);
    assert.ok(session.getPresentationState().screen.unsupportedUiOptions.includes(key));
  }
  assert.equal(options.ext_tabline,false,'unrequested widgets must remain disabled');
  const uis=await client.request('nvim_list_uis',[]);
  assert.equal(uis.length,2);
  assert.ok(uis.some(ui=>ui.ext_multigrid===true));
  await second.request('nvim_ui_detach');
  await client.request('nvim_command',['set linespace=0 nomousehide']);
  await wait(()=>session.getPresentationState().screen.options?.mousehide===false
    && session.getPresentationState().screen.unsupportedUiOptions.length===0);
  for(const key of ['ext_cmdline','ext_popupmenu','ext_messages']) assert.equal(session.getPresentationState().screen.options[key],true);
  console.log('UI option snapshots and second-UI capability negotiation passed');
} finally {second?.close();socket?.destroy();await session.dispose();}
