import {FilamentFunction, strip_under} from './parser.js'
import {isDate} from "date-fns"
import {to_canonical_unit} from './units.js'
import {match_args_to_params} from './util.js'

class ASTNode {
    constructor() {
    }
    log() {
        console.log(`## AST Node ${this.type} ## `,...arguments)
    }
    async evalFilament() {
        throw new Error(`ASTNode ${this.type}  hasn't implemented evalFilament`)
    }
}

export class Scope {
    constructor(id,parent) {
        this.funs= {}
        this.id = id
        this.parent = parent
    }
    clone(id) {
        return new Scope(id,this)
    }
    lookup(name) {
        let result = this.funs[name];
        if(!result) {
            if(this.parent) {
                result = this.parent.lookup(name)
            } else {
                throw new Error(`no such identifier ${name}`)
            }
        }

        return result;
    }
    lookupOrNull(name) {
        let result = this.funs[name];
        if(!result) {
            if(this.parent) {
                result = this.parent.lookupOrNull(name)
            } else {
                result = null;
            }
        }

        return result;
    }
    install(...funs) {
        funs.forEach(fun => {
            this.funs[fun.name] = fun
        })
    }
    set_var(name,value) {
        this.funs[name] = value
        return value
    }
    names() {
        return Object.keys(this.funs)
    }
    dump() {
        console.log(`##### SCOPE == ${this.id} == `,this.names().join(", "))
        if(this.parent)this.parent.dump()
    }
}

class FScalar extends ASTNode {
    constructor(value,unit,dim=1) {
        super()
        this.type = 'scalar'
        this.value = value
        this.unit = unit
        this.dim = dim
        if(value instanceof FScalar) this.value = this.value.value
        if(!unit) this.unit = null
        if(Array.isArray(unit)) {
            if (unit.length === 0) this.unit = null
            if (unit.length === 1) this.unit = unit[0]
        }
        this.unit = to_canonical_unit(this.unit)
        if(this.dim === 0) {
            //dimension of zero means no unit
            this.unit = null
        }
    }
    toString() {
        let v = ""
        if(Number.isInteger(this.value))  v += this.value
        if(!Number.isInteger(this.value)) v += this.value.toFixed(3)
        if(this.unit) v += " "+this.unit
        return v
    }
    evalJS() {
        return this.value
    }
    async evalFilament() {
        return this
    }
}
export const scalar = (n,u,d) => new FScalar(n,u,d)

class FUnit extends ASTNode {
    constructor(u) {
        super();
        this.type = 'unit'
        this.unit = u
    }
    async evalFilament() {
        return this
    }
}
export const unit = (u) => new FUnit(u)

class FString extends ASTNode {
    constructor(value) {
        super()
        this.type = 'string'
        this.value = value
    }
    _slice(a,b) {
        return string(this.value.slice(a,b))
    }
    toString() {
        return `"${this.value}"`
    }
    evalJS() {
        return this.value
    }
    async evalFilament() {
        return this
    }
}
export const string = n => new FString(n)

class FBoolean extends ASTNode {
    constructor(value) {
        super()
        this.type = 'boolean'
        this.value = value
    }
    toString() {
        return (this.value === true)?"true":"false"
    }
    evalJS() {
        return this.value
    }
    async evalFilament() {
        return this
    }
}
export const boolean = v => new FBoolean(v)

class FDate extends ASTNode {
    constructor(year,month,day) {
        super()
        this.type = 'date'
        this.value = new Date(year,month-1,day)
    }
    toString() {
        return (""+this.value)
    }
    evalJS() {
        return this.value
    }
    async evalFilament() {
        return this
    }
}
export const date = (y,m,d) => new FDate(y,m,d)

class FTime extends ASTNode {
    constructor(hour,min,sec) {
        super()
        this.type = 'time'
        if(isDate(hour)) {
            this.value = hour
        } else {
            this.value = new Date(0, 0, 0, hour, min, sec)
        }
    }
    toString() {
        return (""+this.value)
    }
    evalJS() {
        return this.value
    }
    async evalFilament() {
        return this
    }
}
export const time = (hr,min,sec) => new FTime(hr,min,sec)

class FList extends ASTNode {
    constructor(arr) {
        super()
        this.type = 'list'
        this.value = arr
    }

    _get_data_array() {
        return this.value
    }
    _get_length() {
        return this.value.length
    }
    _get_at_index(n) {
        return this.value[n]
    }
    _map(cb) {
        return this.value.map(cb)
    }
    _reduce(cb) {
        return this.value.reduce(cb)
    }
    _forEach(cb) {
        return this.value.forEach(cb)
    }
    _slice(a,b) {
        return new FList(this.value.slice(a,b))
    }
    _sort(cb) {
        return new FList(this.value.sort(cb))
    }
    _filter(cb) {
        return this.value.filter(cb)
    }
    _flatten() {
        let arr = []
        this.value.forEach(a => {
            if(a.type === 'list') {
                arr = arr.concat(a._flatten().value)
            } else {
                arr.push(a)
            }
        })
        return new FList(arr)
    }

    toString() {
        return `[${this.value.join(", ")}]`
    }
    evalJS() {
        return this.value.map(obj => obj.evalJS())
    }
    async evalFilament(scope) {
        let final = []
        for(let i=0; i<this.value.length; i++) {
            let v = await this.value[i].evalFilament(scope)
            final.push(v)
        }
        return new FList(final)
    }
}
export const list = arr => new FList(arr)

export class FTable extends ASTNode {
    constructor(obj) {
        super()
        this.type = 'table'
        // this.log("making using data",obj.data)
        this.schema = obj.data.schema
        this.value = obj.data.items
        Object.entries(this.schema.properties).forEach(([key,val])=>{
            // this.log("schema prop",key,val)
            if(val.type === 'number') {
                // this.log("validating numbers in data")
                this.value.forEach(it => {
                    if(typeof it[key] === 'string') it[key] = parseInt(it[key])
                    // this.log(`converted to number ${it[key]}`)
                })
            }
        })
    }
    async evalFilament() {
        return this
    }
    _get_length() {
        return this.value.length
    }
    _map(cb) {
        return this.value.map(cb)
    }
    _forEach(cb) {
        return this.value.forEach(cb)
    }
    _get_field_from(field, datum, index) {
        return pack(this.value[index][unpack(field)])
    }
    _slice(a,b) {
        return new FTable({data:{schema:this.schema, items:this.value.slice(a,b)}})
    }
}

export class FObject extends ASTNode {
    constructor(obj) {
        super();
        this.type = 'object'
        this.value = obj
    }
    async evalFilament() {
        return this
    }
}

class FCall extends ASTNode {
    constructor(name,args) {
        super()
        this.type = 'call'
        this.name = name
        this.args = args
    }
    toString() {
        return `${this.name}(${this.args.map(a => a.toString()).join(",")})`
    }
    evalJS(scope) {
        if(!scope.lookup(this.name)) throw new Error(`function '${this.name}' not found`)
        let fun = scope.lookup(this.name)
        return fun.apply_function(this.args)
    }
    evalJS_with_pipeline(scope,prepend) {
        if(!scope.lookup(this.name)) throw new Error(`function '${this.name}' not found`)
        let fun = scope.lookup(this.name)
        let args = [prepend].concat(this.args)
        return fun.apply_function(args)
    }
    async evalFilament(scope, prepend) {
        let fun = scope.lookup(this.name)
        if(!fun) throw new Error(`function '${this.name}' not found`)
        let args = this.args.slice()
        if(prepend) args.unshift(prepend)
        let params = match_args_to_params(args,fun.params,this.name)
        let params2 = []
        for(let a of params) {
            if(a && a.evalFilament) a = await a.evalFilament(scope)
            params2.push(a)
        }
        return await fun.do_apply(scope,params2)
    }
}
export const call = (name,args) => new FCall(name,args)

class FunctionDefinition extends ASTNode {
    constructor(name, args, block) {
        super()
        this.type = 'function_definition'
        this.name = name
        this.args = args
        this.block = block
    }
    toString() {
        let args = this.args.map(a => a[0].toString()+":"+a[1].toString())
        return `def ${this.name}(${args.join(",")}) {${this.block.toString()}}`
    }
    async evalFilament(scope) {
        let args = {}
        this.args.forEach(arg => args[arg[0]] = arg[1]) // turn into a map
        scope.install(new FilamentFunction(this.name,args,async (...params)=>{
            let scope2 = scope.clone(this.name)
            this.args.forEach((arg,i) => scope2.set_var(arg[0],params[i]))
            return await this.block.evalFilament(scope2)
        }))
        return this
    }
}
export const fundef = (name,args,block) => new FunctionDefinition(name,args,block)

class FIndexedArg extends ASTNode {
    constructor(value) {
        super()
        this.type = 'indexed'
        this.value = value
    }
    toString() {
        return this.value.toString()
    }
    async evalFilament(scope) {
        this.log("evaluating value",this.value)
        return this.value.evalFilament(scope)
    }
}
export const indexed = v => new FIndexedArg(v)

class FNamedArg extends ASTNode {
    constructor(name,value) {
        super()
        this.type = 'named'
        this.name = name
        this.value = value
    }
    toString() {
        return this.name.toString() + ":" + this.value.toString()
    }
    async evalFilament(scope) {
        this.log("evaluating",this.value)
    }
}
export const named   = (n,v) => new FNamedArg(n,v)

class Pipeline extends ASTNode {
    constructor(dir,first,next) {
        super()
        this.type = 'pipeline'
        this.direction = dir
        this.first = first
        this.next = next
    }
    toString() {
        if(this.direction === 'right') {
            return this.first.toString() + ">>" + this.next.toString()
        }
        if(this.direction === 'left') {
            return this.next.toString() + "<<" + this.first.toString()
        }
    }
    async evalJS(scope) {
        let fval = await this.first.evalJS(scope)
        return this.next.evalJS_with_pipeline(scope,indexed(fval))
    }
    async evalFilament(scope) {
        let val1 = await this.first.evalFilament(scope)
        if(this.next.type === 'identifier') {
            return scope.set_var(this.next.name,val1)
        } else {
            return this.next.evalFilament(scope,indexed(val1))
        }
    }
}
export const pipeline_right = (a,b) => new Pipeline('right',a,b)
export const pipeline_left = (a,b) => new Pipeline('left',b,a)

class Identifier extends ASTNode {
    constructor(name, source) {
        super()
        this.type = 'identifier'
        this.name = strip_under(name.toLowerCase())
        this._source = source
    }
    toString() {
        return this.name
    }
    async evalFilament(scope) {
        try {
            return scope.lookup(this.name)
        } catch (e) {
            // console.log("lookup error",e)
            // console.log("identifier is at",this)
            let err = new Error()
            err.name = "my name"
            err.message = "error at" + JSON.stringify(this._source)
            err.source = this._source
            throw err
        }
    }
}
export const ident = (n,s) => new Identifier(n,s)

class IfExp extends ASTNode {
    constructor(test,then_block,else_block) {
        super();
        this.type = 'if'
        this.test = test
        this.then_block = then_block
        this.else_block = else_block
    }
    async evalFilament(scope) {
        let ans = await this.test.evalFilament(scope)
        if(ans.value === true) {
            return await this.then_block.evalFilament(scope)
        } else {
            return await this.else_block.evalFilament(scope)
        }
    }
}
export const ifexp = (cond,then_block,else_block) => new IfExp(cond,then_block,else_block)

class LambdaExp extends ASTNode {
    constructor(params, block) {
        super();
        this.type = 'lambda'
        this.params = params
        this.block = block
    }

    toString() {
        return `LAMBDA.toString() not implemented`
    }

    async evalFilament(scope) {
        return this
    }

    async apply_function(scope, cb, params) {
        let scope2 = new Scope('lambda',scope)
        this.params.forEach((arg,i) => scope2.set_var(arg[0],params[i]))
        return await this.block.evalFilament(scope2)
    }
    async do_apply(scope, params) {
        let scope2 = new Scope("lambda",scope)
        this.params.forEach((arg,i) => scope2.set_var(arg[0],params[i]))
        return await this.block.evalFilament(scope2)
    }

}
export const lambda = (args,block) => new LambdaExp(args,block)
class FBlock extends ASTNode{
    constructor(sts) {
        super()
        this.type = 'block'
        this.statements = sts
    }
    toString() {
        return this.statements.map(s => s.toString()).join("\n")
    }
    evalJS(scope) {
        let res = this.statements.map(s => s.evalJS(scope))
        return res[res.length-1]
    }
    async evalFilament(scope) {
        let scope2 = scope.clone("block")
        let last = null
        for(let s of this.statements) {
            last = await s.evalFilament(scope2)
        }
        return last
    }
}
export const block = (sts) => new FBlock(sts)

export class IndexRef extends ASTNode {
    constructor(exp,index) {
        super();
        this.exp = exp
        this.index = index
    }

    async evalFilament(scope) {
        let obj = await this.exp.evalFilament(scope)
        let index = await this.index.evalFilament(scope)
        return pack(obj._get_at_index(unpack(index)))
    }
}

export class CanvasResult{
    constructor(cb) {
        this.type = 'canvas-result'
        this.cb = cb
    }
}

export function pack(val) {
    if(typeof val === 'number') return scalar(val)
    if(typeof val === 'string') return string(val)
    if(typeof val === 'boolean') return boolean(val)
    // console.log("can't pack value",val, typeof val)
    return val
}
export function unpack(v) {
    if(v.type === 'scalar') return v.value
    if(v.type === 'string') return v.value
    if(v.type === 'boolean') return v.value
    // console.log("can't unpack value",v)
    return v
}
export const is_error_result = (result) => result instanceof Error
export const is_scalar = (a) => a&&a.type === 'scalar'
export const is_boolean = (a) => a&&a.type === 'boolean'
export const is_string = (a) => a&&a.type === 'string'
export const is_list = (b) => b&&b.type === 'list'
export const is_canvas_result = (b) => b &&b.type === 'canvas-result'
export const is_image_result = (b) => b && b.data && b.width && b.height
