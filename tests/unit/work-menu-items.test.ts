import test from 'node:test'
import assert from 'node:assert/strict'
import { nextForeshadowTitle } from '../../src/lib/foreshadow-title'

test('WMU-01: nextForeshadowTitle picks the smallest unused exact "未命名伏笔 n"', () => {
  assert.equal(nextForeshadowTitle([]), '未命名伏笔 1')
  assert.equal(nextForeshadowTitle(['未命名伏笔 1', '未命名伏笔 3']), '未命名伏笔 2')
  assert.equal(nextForeshadowTitle(['未命名伏笔 2']), '未命名伏笔 1')
  assert.equal(nextForeshadowTitle(['未命名伏笔 1', '未命名伏笔 2']), '未命名伏笔 3')
  assert.equal(nextForeshadowTitle(['未命名伏笔1', '未命名伏笔 01', '其他']), '未命名伏笔 1')
})
