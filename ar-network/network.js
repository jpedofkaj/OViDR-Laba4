/* Данные топологии и поиск маршрута. Этот файл не зависит от 3D-библиотек. */
(function (root) {
  'use strict';
  const nodes = [
    {id:'pc1',name:'ПК1',label:'PC 1',type:'pc',ip:'192.168.1.10',pos:[-2.5,0,-1],info:'Компьютер первой подсети. IP: 192.168.1.10/24. Шлюз: 192.168.1.1.'},
    {id:'pc2',name:'ПК2',label:'PC 2',type:'pc',ip:'192.168.1.20',pos:[-2.5,0,1],info:'Компьютер первой подсети. IP: 192.168.1.20/24. Шлюз: 192.168.1.1.'},
    {id:'sw1',name:'Коммутатор 1',label:'SW 1',type:'switch',pos:[-1.2,0,0],info:'Коммутатор первой локальной сети. Пересылает Ethernet-кадры по MAC-адресам. В модели нужный выходной порт уже известен.'},
    {id:'r1',name:'Маршрутизатор',label:'ROUTER',type:'router',pos:[0,0,0],info:'Соединяет подсети 192.168.1.0/24 и 192.168.2.0/24. Адреса интерфейсов: 192.168.1.1 и 192.168.2.1. Передаёт IP-пакеты между подсетями.'},
    {id:'sw2',name:'Коммутатор 2',label:'SW 2',type:'switch',pos:[1.2,0,0],info:'Коммутатор второй локальной сети. Пересылает Ethernet-кадры по MAC-адресам. В модели нужный выходной порт уже известен.'},
    {id:'pc3',name:'ПК3',label:'PC 3',type:'pc',ip:'192.168.2.10',pos:[2.5,0,-1],info:'Компьютер второй подсети. IP: 192.168.2.10/24. Шлюз: 192.168.2.1.'},
    {id:'server',name:'Сервер',label:'SERVER',type:'server',ip:'192.168.2.100',pos:[2.5,0,1],info:'Сервер второй подсети. IP: 192.168.2.100/24. Шлюз: 192.168.2.1. В этой модели может отправлять и получать пакеты.'}
  ];
  const links = [['pc1','sw1'],['pc2','sw1'],['sw1','r1'],['r1','sw2'],['sw2','pc3'],['sw2','server']];
  const byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
  function route(from,to) {
    if (!byId[from] || !byId[to]) return [];
    const queue=[[from]],seen=new Set([from]);
    while(queue.length){
      const path=queue.shift(),last=path[path.length-1];
      if(last===to)return path;
      for(const [a,b] of links){
        const next=a===last?b:b===last?a:null;
        if(next&&!seen.has(next)){seen.add(next);queue.push([...path,next]);}
      }
    }
    return [];
  }
  root.Network={nodes,links,byId,route,endpoints:nodes.filter(n=>n.ip)};
  if(typeof module!=='undefined')module.exports=root.Network;
})(typeof window!=='undefined'?window:globalThis);
