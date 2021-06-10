import {FilamentFunction, FilamentFunctionWithScope, REQUIRED} from './parser.js'
import {CanvasResult, FObject, list, scalar, string, unpack} from './ast.js'

export const rect = new FilamentFunctionWithScope('rect',
    {
        x:scalar(0),
        y:scalar(0),
        width:scalar(10),
        height:scalar(10),
        fill:string("red"),
    },
    function (scope, x,y,width,height,fill) {
        return new FObject({
            type:'rect',
            x,y,width,height,fill
        })
    }
)

export const circle = new FilamentFunctionWithScope('circle',
    {
        x:scalar(0),
        y:scalar(0),
        radius:scalar(10),
        fill:string("black"),
    },
    function (scope, x,y,radius,fill) {
        return new FObject({
            type:'circle',
            x,y,radius,fill
        })
    }
)

export const row = new FilamentFunctionWithScope('row',{
    data:REQUIRED,
    gap:scalar(1,'cm')
}, function(scope,data,gap){
    data = data._flatten()
    // console.log("laying out",data)
    let x = 0
    let y = 0
    let mh = 0
    let mw = 1000
    return list(data._map(r => {
        // this.log("rect",r)
        let h = to_px(r.value.height)
        if(h>mh) mh = h;
        let w = to_px(r.value.width)
        if(x+w > mw) {
            x = 0
            y = y + mh
        }
        let r2 = new FObject({
            type:r.value.type,
            x:scalar(x),
            y:scalar(y),
            width:r.value.width,
            height:r.value.height,
            fill:r.value.fill,
        })
        x += to_px(r.value.width)
        x += to_px(gap)
        return r2
    }))
})


function fill_bg(canvas, ctx, fill) {
    ctx.fillStyle = to_color(fill)
    ctx.fillRect(0,0,canvas.width,canvas.height)
}

export const draw = new FilamentFunctionWithScope('draw',
    {
        data:REQUIRED,
        width:scalar(100),
        height:scalar(100),
        fill:string('white'),
    },
    function (scope, data, width, height, fill) {
        return new CanvasResult((canvas) => {
            const mouseEventHandler = async (name, e) => {
              // console.log('####', name, e.offsetX, e.offsetY);
              const fun = scope.lookupOrNull(name)
              let newResult = null
              if (fun) {
                const newResult = await fun.do_apply(scope, [scalar(e.offsetX), scalar(e.offsetY)])
                // console.log('newResult', newResult)
              }
              return newResult
            };

            // Add the event listeners for mousedown, mousemove, and mouseup
            canvas.addEventListener('mousedown', async e => {
              return await mouseEventHandler('mousedown', e);
            });


            canvas.addEventListener('mouseup', async e => {
              return await mouseEventHandler('mouseup', e);
            });

            canvas.addEventListener('mousemove', async e => {
              return await mouseEventHandler('mousemove', e);
            });

            let ctx = canvas.getContext('2d')
            ctx.save()
            canvas.width = to_px(width);
            canvas.height = to_px(height);
            fill_bg(canvas,ctx,fill)
            // ctx.scale(10,10)
            // this.log("drawing data",data)
            if(data.type) {
                draw_shape(ctx,data)
            }
            ctx.restore()
        })
    }
)

const IN_PX = 72
const CM_PX = IN_PX/2.54
function to_px(value) {
    // console.log("converting to pixels",value)
    if(value.unit) {
        if(value.unit === 'centimeter') {
            return value.value * CM_PX
        }
        if(value.unit === 'inch') {
            return value.value * IN_PX
        }
    }
    return value.value
}

function to_color(fill) {
    // console.log("converting color",fill)
    if(fill.type === 'string') return fill.value
    if(fill.type === 'list') {
        if(fill._get_length() === 3) {
            let vals = fill.value.map(s => (s.value*255).toFixed(2)).join(",")
            return `rgb(${vals})`
        }
    }
    return 'blue'
}

function draw_shape(ctx, data) {
    // console.log('drawing',data)
    if(data.type === 'object') {
        draw_shape(ctx,data.value)
        return
    }
    if(data.type === 'list') {
        data._forEach(el => {
            draw_shape(ctx,el.value)
        })
        return
    }

    if(data.type === 'rect') {
        // console.log("drawings",data)
        ctx.fillStyle = to_color(data.fill)
        let x = to_px(data.x)
        let y = to_px(data.y)
        let w = to_px(data.width)
        let h = to_px(data.height)
        // console.log("using",x,y,w,h,ctx.fillStyle)
        ctx.fillRect(x,y,w,h)
        // console.log("filled")
        return
    }
    if(data.type === 'circle')  {
        ctx.fillStyle = to_color(data.fill)
        let x = to_px(data.x)
        let y = to_px(data.y)
        let radius = to_px(data.radius)
        ctx.beginPath()
        ctx.arc(x,y,radius, 0, Math.PI*2)
        ctx.fill()
        return
    }
    console.log("Unknown type",data.type)
}


export const hsl_to_rgb = new FilamentFunctionWithScope('hsltorgb',{
    color:REQUIRED,
}, function(scope,color){

    let h = unpack(color._get_at_index(0)%1)*360
    let s = unpack(color._get_at_index(1))
    let l = unpack(color._get_at_index(2))
    // this.log("hsl",h,s,l)

    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c/2,
        r = 0,
        g = 0,
        b = 0;

    if (0 <= h && h < 60) {
        r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
        r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
        r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
        r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
        r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
        r = c; g = 0; b = x;
    }
    r = r+m
    g = g+m
    b = b+m
    // this.log("rgb",r,g,b)
    return list([scalar(r),scalar(g),scalar(b)])
})
