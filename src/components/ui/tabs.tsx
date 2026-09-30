"use client"; import {useState}from"react";
export function Tabs({items,initial=0}:{items:string[];initial?:number}){const[active,setActive]=useState(initial);return <div className="vf-tabs" role="tablist">{items.map((item,index)=><button key={item} className="vf-tab" data-active={active===index} role="tab" aria-selected={active===index} onClick={()=>setActive(index)}>{item}</button>)}</div>}
