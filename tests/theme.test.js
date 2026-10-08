import test from 'node:test';
import assert from 'node:assert/strict';
import {colors} from '../src/themes.js';
function luminance(hex){const rgb=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('all 14 theme accent text and button labels meet 4.5:1 contrast',()=>{for(const[name,c]of Object.entries(colors)){assert.ok(contrast(c.light,'#fffefa')>=4.5,`${name} light text`);assert.ok(contrast(c.light,'#ffffff')>=4.5,`${name} light button`);assert.ok(contrast(c.dark,'#222925')>=4.5,`${name} dark text`);assert.ok(contrast(c.dark,'#17231b')>=4.5,`${name} dark button`);}for(const [a,b] of [['#25332b','#fffefa'],['#626d65','#fffefa'],['#edf0eb','#222925'],['#adbab0','#222925']])assert.ok(contrast(a,b)>=4.5);});
