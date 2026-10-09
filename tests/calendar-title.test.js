import test from 'node:test';
import assert from 'node:assert/strict';
import {eventPayload} from '../src/model.js';
test('new calendar events use unprefixed titles',()=>{assert.equal(eventPayload({date:'2026-10-09',status:'actual',dishes:[{name:'鮭',category:'main'}]}).summary,'鮭');});
