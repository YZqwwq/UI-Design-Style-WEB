export function installManagement({request,getUser,refresh,openDetail,mutateAuth,escapeHTML}) {
  const dialog=document.querySelector('#manage-dialog');
  const content=document.querySelector('#manage-content');
  let version=0;
  dialog.addEventListener('close',()=>{version++;content.replaceChildren();});
  document.querySelector('#close-manage').addEventListener('click',()=>dialog.close());
  function open(title,body) {
    if (!getUser()) return;
    version++;
    document.querySelector('#manage-title').textContent=title;
    content.innerHTML=body;
    if (!dialog.open) dialog.showModal();
  }
  const status=()=>content.querySelector('[role=status]');
  async function submit(form,work) {
    const ticket=version, user=getUser()?.id;
    const buttons=[...form.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
    try { await work(); }
    catch(error) { if(ticket===version && getUser()?.id===user && status()) status().textContent=error.message; }
    finally { if(ticket===version) buttons.forEach(b=>b.disabled=false); }
  }
  async function editor(id) {
    const owner=getUser()?.id;
    if (!owner) return;
    open(id?'编辑设计':'新增设计','<p role="status">正在加载…</p>');
    const ticket=version;
    try {
      const [catalog,design]=await Promise.all([request('/catalog'),id?request(`/designs/${encodeURIComponent(id)}`):Promise.resolve({})]);
      if(ticket!==version || getUser()?.id!==owner) return;
      const fields=[['name','设计名称'],['english','英文名'],['label','预览标题'],['subtitle','预览副标题'],['code','预览编号'],['description','设计说明'],['use','适用场景'],['layout','布局'],['typography','字体'],['surface','材质'],['interaction','交互']];
      content.innerHTML=`<form novalidate class="manage-form"><div class="manage-fields">${fields.map(([key,label])=>`<label>${label}<${['description','use','layout','typography','surface','interaction'].includes(key)?'textarea':'input'} name="${key}">${['description','use','layout','typography','surface','interaction'].includes(key)?'</textarea>':''}</label>`).join('')}
        <label>分类<select name="category">${catalog.categories.map(v=>`<option>${escapeHTML(v)}</option>`).join('')}</select></label>
        <label>标签<select name="tag">${catalog.tags.map(v=>`<option>${escapeHTML(v)}</option>`).join('')}</select></label>
        <label>预览风格<select name="tone">${['editorial','brutal','glass','swiss','terminal','retro','bento','mono'].map(v=>`<option>${v}</option>`).join('')}</select></label>
        <label>配色（用逗号分隔，如 #ffffff）<input name="colors"></label></div>
        <p role="status" aria-live="polite"></p><div class="manage-actions"><button class="primary" type="submit">保存设计</button>${id?'<button type="button" id="delete-design" class="shell-button">删除设计</button>':''}</div></form>`;
      const form=content.querySelector('form');
      for(const [key,value] of Object.entries(design)) if(form.elements.namedItem(key)) form.elements.namedItem(key).value=key==='colors'?value.join(', '):value;
      if(!id) form.elements.namedItem('colors').value='#ffffff, #111111';
      form.addEventListener('submit',event=>{
        event.preventDefault();
        const body=Object.fromEntries(new FormData(form));body.colors=body.colors.split(',').map(v=>v.trim());
        void submit(form,async()=>{
          const saved=await request(id?`/designs/${encodeURIComponent(id)}`:'/designs',{method:id?'PUT':'POST',body:JSON.stringify(body)});
          if(ticket!==version || getUser()?.id!==owner)return;
          dialog.close();await refresh();await openDetail(saved.id);
        });
      });
      content.querySelector('#delete-design')?.addEventListener('click',()=>{
        if(!window.confirm('删除这个设计？此操作无法撤销。'))return;
        void submit(form,async()=>{
          await request(`/designs/${encodeURIComponent(id)}`,{method:'DELETE'});
          if(ticket!==version || getUser()?.id!==owner)return;
          dialog.close();document.querySelector('#detail').close();await refresh();
        });
      });
    } catch(error) { if(ticket===version) status().textContent=error.message; }
  }
  async function terms(kind) {
    const owner=getUser()?.id;if(!owner)return;
    open(kind==='categories'?'管理分类':'管理标签','<p role="status">正在加载…</p>');
    const ticket=version;
    try {
      const rows=await request(`/${kind}`);
      if(ticket!==version || getUser()?.id!==owner)return;
      content.innerHTML=`<p>已有设计使用的分类或标签，需要先调整相关设计才能删除。</p><div class="term-list">${rows.map(row=>`<form novalidate data-id="${escapeHTML(row.id)}"><input name="name" aria-label="名称" value="${escapeHTML(row.name)}"><button class="shell-button" type="submit">重命名</button><button class="shell-button" type="button" data-delete>删除</button></form>`).join('')}</div><form novalidate class="term-create"><input name="name" aria-label="新增名称" placeholder="新增名称"><button class="primary" type="submit">添加</button></form><p role="status" aria-live="polite"></p>`;
      for(const form of content.querySelectorAll('form')){
        const act=method=>submit(form,async()=>{
          await request(`/${kind}${form.dataset.id?'/'+encodeURIComponent(form.dataset.id):''}`,{method,...(method==='DELETE'?{}:{body:JSON.stringify({name:new FormData(form).get('name')})})});
          if(ticket!==version || getUser()?.id!==owner)return;
          await refresh();await terms(kind);
        });
        form.addEventListener('submit',e=>{e.preventDefault();void act(form.dataset.id?'PUT':'POST');});
        form.querySelector('[data-delete]')?.addEventListener('click',()=>{if(window.confirm('删除这个分类或标签？'))void act('DELETE');});
      }
    }catch(error){if(ticket===version)status().textContent=error.message;}
  }
  function account() {
    open('账号设置',`<form novalidate class="manage-form"><p>修改密码后，所有设备都会退出登录。</p><label>当前密码<input type="password" name="currentPassword" autocomplete="current-password"></label><label>新密码<input type="password" name="password" autocomplete="new-password" placeholder="10–128 位"></label><label>确认新密码<input type="password" name="confirmation" autocomplete="new-password"></label><p role="status" aria-live="polite"></p><button type="submit" class="primary">修改密码并退出</button><button type="button" id="logout-all" class="shell-button">退出全部设备</button></form>`);
    const form=content.querySelector('form');if(!form)return;
    form.addEventListener('submit',event=>{event.preventDefault();void submit(form,async()=>{await mutateAuth('/auth/password',Object.fromEntries(new FormData(form)));dialog.close();});});
    content.querySelector('#logout-all').addEventListener('click',()=>void submit(form,async()=>{await mutateAuth('/auth/logout-all',{});dialog.close();}));
  }
  document.querySelector('#new-design').addEventListener('click',()=>void editor());
  document.querySelector('#manage-categories').addEventListener('click',()=>void terms('categories'));
  document.querySelector('#manage-tags').addEventListener('click',()=>void terms('tags'));
  return {editor,account,close:()=>dialog.close()};
}
