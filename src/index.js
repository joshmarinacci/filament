import {Parser, FilamentFunction, FilamentFunctionWithScope} from './parser.js'
import {make_standard_scope} from './lang.js'
import filament_grammar from "./filament.ohm.js"

let scope
let parser

export async function setup_parser() {
    scope = make_standard_scope()
    parser = new Parser(scope, filament_grammar)
}

export async function eval_code(code, custom_scope) {
    if (!custom_scope) custom_scope = scope
    let match = parser.parse(code + "\n")
    // console.log("parsed",match)
    if (match.failed()) throw new Error("match failed")
    let ast = parser.ast(match)
    // console.log('ast',ast)
    // console.log("evaluating with scope",custom_scope)
    return await ast.evalFilament(custom_scope)
}

export {
    is_scalar,
    is_boolean,
    is_canvas_result,
    is_error_result,
    is_list,
    is_string,
    date,
    scalar,
    boolean,
    string,
    time,
} from "./ast.js"

export {
    make_standard_scope
} from './lang.js'

export {
    FilamentFunction,
    FilamentFunctionWithScope,
    REQUIRED
} from './parser.js'


export async function parseAndEvalWithScope(code, localScope) {
    const localParser = new Parser(localScope, filament_grammar)

    let match = localParser.parse(code + "\n")
    if (match.failed()) throw new Error("match failed")
    let ast = localParser.ast(match)
    return await ast.evalFilament(localScope)
}
