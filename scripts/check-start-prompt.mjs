// 校验：lab/app.js 里「发起制作」发出的指令是否为完整指令
import { readFileSync } from 'node:fs'

const src = readFileSync('lab/app.js', 'utf8')
const fn = new Function(`return ${src.match(/function buildPrompt\(topic\) \{[\s\S]*?\n\}/)[0]}`)()

for (const topic of [
  '做一节勾股定理的互动课，学生能拖拽方块拼出面积证明',
  '做一个单摆实验的虚拟实验室课件，能调摆长看周期变化',
]) {
  const out = fn(topic)
  console.log('==>', out.split('\n')[0])
  if (!out.startsWith('请利用「课程工坊」插件，制作')) throw new Error('首行缺少插件前缀')
  if (!out.includes(topic)) throw new Error('需求原文丢失')
  if (!out.includes('course_studio lint')) throw new Error('闭环指令丢失')
}

const startBlock = src.match(/f-start[\s\S]{0,600}?\n  \}\)/)
if (!startBlock || !/start\(buildPrompt\(topic\)\)/.test(startBlock[0])) throw new Error('发起制作按钮未发送完整指令')
// 「查看完整指令」的 textarea 必须与按钮发送的是同一个函数产出
const copyBlock = src.match(/f-copy[\s\S]{0,300}?\n  \}\)/)
if (!copyBlock || !/sync\(\); copy\(promptEl\.value\)/.test(copyBlock[0])) throw new Error('复制指令与按钮不一致')
if (!/sync\(\) \/\/ 进页面/.test(src)) throw new Error('进页面未渲染指令')

console.log('\nOK：发起制作 / 复制指令 / 预览框 三处现在都是同一条完整指令')
