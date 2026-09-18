const ui=interfaceMod('seele/estilo','Estilo do servidor','Uma identidade visual para todo mundo que entra.');
const palettes={
  'SEELE':{accent:'#f2521f',background:'#050403',panel:'#0a0806',text:'#eae3cf',muted:'#908574',border:'#3a322a'},
  'Aurora':{accent:'#a78bfa',background:'#10121b',panel:'#191d2b',text:'#f2f4ff',muted:'#b3bdd4',border:'#424b65'},
  'Oceano':{accent:'#67e8f9',background:'#071821',panel:'#102632',text:'#e4f9ff',muted:'#a4c7d4',border:'#365868'},
  'Jardim':{accent:'#86efac',background:'#0e1914',panel:'#172b20',text:'#edfff1',muted:'#a9c7b2',border:'#3c5945'},
  'Brasa':{accent:'#ffba85',background:'#1b1210',panel:'#2b1e18',text:'#fff3e8',muted:'#d4b7a3',border:'#6c4b3a'}
};
const tokens={accent:'--seele-laranja-nerv',background:'--seele-negro-absoluto',panel:'--seele-negro-painel',text:'--seele-osso',muted:'--seele-osso-apagado',border:'--seele-linha'};
const original=new Map();let state=null,draft=null,fields={},revision=null;
function setToken(name,value){const style=document.documentElement.style;if(!original.has(name))original.set(name,[style.getPropertyValue(name),style.getPropertyPriority(name)]);style.setProperty(name,value);}
function restore(){for(const [name,[value,priority]] of original){if(value)document.documentElement.style.setProperty(name,value,priority);else document.documentElement.style.removeProperty(name);}original.clear();document.documentElement.classList.remove('seele-estilo-active');}
ui.disposers.push(restore);
ui.css(`.seele-estilo-active #tela-sessao .pessoa,.seele-estilo-active #tela-sessao .sala,.seele-estilo-active #tela-sessao button{border-radius:var(--estilo-radius,0px)}`);
ui.css(`.seele-estilo-active #tela-sessao .pessoa{padding:var(--estilo-padding,12px);box-shadow:var(--estilo-glow,none)}`);
function apply(value,enabled=true){
  if(!enabled){restore();return;}
  document.documentElement.classList.add('seele-estilo-active');
  for(const [key,token] of Object.entries(tokens))setToken(token,value[key]);
  setToken('--seele-rotulo-painel',value.muted);setToken('--seele-linha-forte',value.border);
  setToken('--seele-laranja-fraco',value.panel);setToken('--seele-laranja-carga',value.panel);
  setToken('--estilo-radius',value.radius+'px');setToken('--estilo-padding',value.density==='compact'?'6px':'14px');
  setToken('--estilo-glow',value.glow?'0 0 18px '+value.accent+'22':'none');
  setToken('--seele-mono',value.font==='sans'?'system-ui, sans-serif':'"IBM Plex Mono", monospace');
}
function edit(){
  draft={...state.theme};revision=state.revision;fields={};ui.body.replaceChildren();
  const grid=ui.el('div',undefined,'sm-grid'),form=ui.el('div'),preview=ui.el('div');
  const presets=ui.el('div',undefined,'sm-actions');
  for(const [name,palette] of Object.entries(palettes))presets.append(ui.button(name,()=>{draft={...draft,...palette};for(const key of Object.keys(palette))fields[key].value=draft[key];paint();}));
  form.append(ui.el('h2','Paletas'),presets,ui.el('p','Escolha uma base e ajuste os detalhes.'));
  const colors=ui.el('div',undefined,'sm-colors');
  for(const [key,label] of Object.entries({accent:'Destaque',background:'Fundo',panel:'Painéis',text:'Texto',muted:'Texto secundário',border:'Bordas'})){
    const f=ui.field(label,'color',draft[key]);fields[key]=f.input;f.input.oninput=()=>{draft[key]=f.input.value;paint();};colors.append(f.wrap);
  }
  form.append(colors);
  for(const [key,label,type,options] of [
    ['radius','Arredondamento','range',{min:0,max:24}],
    ['density','Espaçamento','select',{values:[['comfortable','Confortável'],['compact','Compacto']]}],
    ['font','Tipografia dos dados','select',{values:[['sans','Moderna'],['mono','Monoespaçada']]}],
    ['glow','Brilho suave nos cartões','checkbox',{}]
  ]){const f=ui.field(label,type,draft[key],options);f.input.oninput=()=>{draft[key]=type==='checkbox'?f.input.checked:type==='range'?Number(f.input.value):f.input.value;paint();};form.append(f.wrap);}
  preview.append(ui.el('h2','Prévia'),ui.el('p','Só será aplicada ao servidor quando você salvar.'));
  const sample=ui.el('div');sample.style.padding='24px';sample.append(ui.el('h2','Seu servidor, do seu jeito'),ui.el('p','Uma conversa começa com quem está aqui.'),ui.el('button','Destaque'));
  preview.append(sample);grid.append(form,preview);ui.body.append(grid);
  function paint(){sample.style.background=draft.panel;sample.style.color=draft.text;sample.style.border='1px solid '+draft.border;sample.style.borderRadius=draft.radius+'px';sample.querySelector('p').style.color=draft.muted;const b=sample.querySelector('button');b.style.background=draft.accent;b.style.color=draft.background;}
  paint();
  const actions=ui.el('div',undefined,'sm-actions');
  if(state.canEdit){
    actions.append(ui.button('Salvar para o servidor',async()=>{state=await ui.request({op:'save',revision,theme:draft});apply(state.theme,state.enabled);edit();ui.message('Tema salvo. Os participantes recebem a atualização em até 4 segundos.');},true));
    actions.append(ui.button('Restaurar aparência padrão',async()=>{state=await ui.request({op:'reset',revision});restore();edit();ui.message('Aparência padrão restaurada.');}));
  }else{form.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);actions.append(ui.el('p','Somente o host ou administrador pode salvar alterações.'));}
  actions.append(ui.button('Recarregar',async()=>{state=await ui.request({op:'view'});edit();ui.message('Tema recarregado.');}));
  ui.body.append(actions);
}
ui.onPoll=async()=>{const next=await ui.request({op:'view'});if(state && next.revision<state.revision)return;if(state?.revision!==next.revision || state?.enabled!==next.enabled)apply(next.theme,next.enabled);state=next;};
ui.onOpen=async()=>{state=await ui.request({op:'view'});edit();ui.message(state.enabled?'Tema compartilhado ativo.':'A aparência padrão está ativa.');};
ui.start();
