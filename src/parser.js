import ohm from "ohm-js"
import {
    block,
    boolean,
    call,
    fundef,
    ident, ifexp,
    indexed, IndexRef, lambda,
    list,
    named,
    pipeline_left,
    pipeline_right,
    scalar,
    string
} from './ast.js'
import {is_valid_unit, to_canonical_unit} from './units.js'
import {match_args_to_params} from './util.js'

export const REQUIRED = Symbol('REQUIRED')

export const strip_under = s => s.replaceAll("_", "")

function do_bin_op(op, a, c) {
    if (BINOPS[op]) return call(BINOPS[op], [indexed(a), indexed(c)])
    throw new Error(`Unknown operator: ${op}`)
}
function do_un_op(op,val) {
    if (UNOPS[op]) return call(UNOPS[op], [indexed(val)])
    throw new Error(`Unknown operator: ${op}`)
}


export class Parser {
    constructor(scope, grammar_source) {
        this.scope = scope
        this.grammar_source = grammar_source
        this.init(this.scope)
    }

    init(scope) {
        this.grammar = ohm.grammar(this.grammar_source)
        this.semantics = this.grammar.createSemantics()
        this.semantics.addOperation('ast', {
            _terminal() { return this.sourceString },

            //primitives
            ident(i, i2) { return ident(this.sourceString,this.source) },
            bool: (a) => boolean(parseBoolean(a.sourceString)),
            string: (_1, str, _2) => string(str.sourceString),

            // number literals and units
            number_whole: a => scalar(parseInt(strip_under(a.sourceString))),
            number_hex: (_, a) => scalar(parseInt(strip_under(a.sourceString), 16)),
            number_fract: (a, b, c) => scalar(parseFloat(strip_under(a.sourceString + b.sourceString + c.sourceString))),
            unit: u => {
                let name = u.sourceString
                if (is_valid_unit(name)) return to_canonical_unit(name)
                throw new Error(`unknown unit type '${name}'`)
            },
            unitnumber: (v, u) => scalar(v.ast(), u.ast()),

            // lists
            NonemptyListOf: (a, b, c) => [a.ast()].concat(c.ast()),
            EmptyListOf: () => [],
            List: (a, b, c) => list(b.ast()),

            // all binary operators
            AsExp_convert: (v1, op, v2) => do_bin_op(op.ast(),v1.ast(),v2.ast()),
            BoolExp_bool: (v1, op, v2) => do_bin_op(op.ast(),v1.ast(),v2.ast()),
            AddExp_add: (a, op, c) => do_bin_op(op.ast(),a.ast(),c.ast()),
            MulExp_mul: (a, op, c) => do_bin_op(op.ast(),a.ast(),c.ast()),
            PipeOp_right: (first, _, next) => pipeline_right(first.ast(), next.ast()),
            PipeOp_left:(next, _, first) => pipeline_left(next.ast(), first.ast()),

            // all unary operators
            UnExp: (op, val) => do_un_op(op.ast(),val.ast()),

            GroupExp: (_1, e, _2) => e.ast(),

            // function definitions and calls
            Arg_named: (a, _, c) => named(a.ast().name, c.ast()),
            Arg_indexed: a => indexed(a.ast()),
            FuncallExp: (ident, _1, args, _2) => call(ident.ast().name, args.ast()),
            DefArg_default: (a, _, c) => [a.ast().name, c.ast()],
            DefArg_solo:(a) => [a.ast().name],
            FundefExp: (def, name, _1, args, _2, block) => fundef(name.ast().name, args.ast(), block.ast()),

            //lambdas
            LambdaExp_full:  (_1, args, _2, _3, block) => lambda(args.ast(),block.ast()),
            LambdaExp_short: (args, _3, block) => lambda([args.ast()],block.ast()),

            //conditionals
            IfExp_short: (_if, test, _then, a) => ifexp(test.ast(),a.ast()),
            IfExp_full:  (_if, test, _then, a, _else, b) => ifexp(test.ast(),a.ast(),b.ast()),

            //index dereference
            IndexRef: (exp, _1, index, _2) => new IndexRef(exp.ast(),index.ast()),

            Block: (_1, statements, _2) => block(statements.ast()),
        })
        this.semantics.addOperation('unicode',{
            _terminal() { return this.sourceString },
            ident(i, i2) { return ident(this.sourceString, this.source)  },
            number(v) {
                v = v.ast()
                return ""+v.value
            },
            MulExp_mul: (v1, op, v2) => {
                op = op.ast()
                if(op === '*') op = "×"
                return `${v1.unicode()} ${op} ${v2.unicode()}`
            },
            BoolExp_bool: (v1, op, v2) => {
                op = op.unicode()
                if(op === '<>') op = "≠"
                return `${v1.unicode()} ${op} ${v2.unicode()}`
            },
            PipeOp_right: (first, _, next) => `${first.unicode()} → ${next.unicode()}`
        })
    }

    parse(code) {
        return this.grammar.match(code)
    }

    ast(match) {
        return this.semantics(match).ast()
    }

}

export class FilamentFunction {
    constructor(name, params, fun, opts) {
        this.type = 'native-function'
        this.name = strip_under(name.toLowerCase())
        this.params = params
        this.fun = fun
        this.summary = ""
        if(opts) {
            if(opts.summary) this.summary = opts.summary
        }
    }

    log() {
        const args = Array.prototype.slice.call(arguments)
        console.log('###', this.name.toUpperCase(), ...args);
    }

    apply_function(args) {
        const params = match_args_to_params(args,this.params,this.name)
        return this.apply_with_parameters(params)
    }

    async apply_with_parameters(params) {
        let ps = []
        for (let p of params) {
            if (p && p.type === 'callsite') {
                ps.push(await p.apply())
            } else {
                ps.push(await p)
            }
        }
        return await this.fun.apply(this, ps)
    }
    do_apply(scope,params) {
        return this.fun.apply(this,params)
    }
}

export class FilamentFunctionWithScope extends FilamentFunction {
    do_apply(scope,params) {
        return this.fun.apply(this,[scope].concat(params.slice()))
    }
}

function parseBoolean(sourceString) {
    if (sourceString.toLowerCase() === 'true') return true
    if (sourceString.toLowerCase() === 'false') return false
    throw new Error(`invalid boolean '${sourceString}'`)
}

const UNOPS = {
    '-': 'negate',
    '!': 'factorial',
    'not': 'not'
}
const BINOPS = {
    '+': 'add',
    '-': 'subtract',
    '*': 'multiply',
    '/': 'divide',
    '**': 'power',
    '<': 'lessthan',
    '>': 'greaterthan',
    '=': 'equal',
    '<>': 'notequal',
    '<=': 'lessthanorequal',
    '>=': 'greaterthanorequal',
    'as': 'convertunit',
    'and': 'and',
    'or': 'or',
    'mod': 'mod'
}

