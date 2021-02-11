import assert from "assert"
import {eval_code} from '../src/index.js'
import {boolean, list, scalar} from '../src/ast.js'

export async function t(str, ans) {
    let ret = await eval_code(str)
    // console.log(str,'became',ret)
    // console.log('answer is',ans)
    assert.deepStrictEqual(ret,ans)
    // assert.equal(ret.value,ans.value)
}

export async function all(args) {
    return Promise.all(args.map(tx => {
        return Promise.resolve(t(tx[0],tx[1]))
    }))
}

// export const all_close_scalar = async (tests) => await tests.map(tt => ta(tt[0],tt[1]))
export async function all_close_scalar(args) {
    return Promise.all(args.map(tx => {
        return Promise.resolve(ta(tx[0],tx[1]))
    }))
}

export const ta = async (s,a) => {
    return Promise.resolve(eval_code(s)).then(v=>{
        // console.log("testing",s ,'equals',a,'really is',v)
        assert(Math.abs(v.value - a.value) < 0.01);
        assert.equal(v.unit,a.unit)
        assert.equal(v.dim,a.dim)
    })
}


export const s = (v,u,d) => scalar(v,u,d)
export const b = (v) => boolean(v)
export const l = (...vals) => list(vals.map(v => scalar(v)))