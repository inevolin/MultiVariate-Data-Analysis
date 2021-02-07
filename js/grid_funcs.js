let wto;

$(document).ready(function() {
    load_options();
    $('#loader').hide();
    load_data();
});

function load_options() {
    $('#ysortchk').on('change', function() { 
        processData(glob_data);
    });
    $('#colorscalechk').on('change', function() { 
        processData(glob_data);
    });
}

let tableId = '#example';
let tablelet = null;

function getArg(x) {
    let url = new URL(window.location);
    return url.searchParams.get(x);
}

let glob_annotate = getArg('annotate');
let glob_testlike = getArg('testlike');
let glob_lastdays = getArg('lastdays');
let glob_testdays = getArg('testdays');

let glob_data = null;
let matrixBase = null;
let matrixTest = null;

$.ajaxSetup({
    scriptCharset: "utf-8",
    contentType: "application/json; charset=utf-8"
});

function load_data() {
    $('#loader').show(); // show gif loader
    $.getJSON("data.json", function(data) {
        const tmp = []
        for (const d of data) {
            if (!glob_testlike || d.test.includes(glob_testlike))
                tmp.push(d)
        }
        glob_data = data = tmp;
        processData(data);
        $('#loader').hide();   
    });
}

// this functions will do necessary pre-processing and add data to table
function processData(data) {
    $('#graphParent').empty();
    data = JSON.parse(JSON.stringify(data)); // make sure we dont mess up original object

    let dict = {};
    for (let key in data) {
        let val = data[key];
        let test = val['test'];
        if (!(test in dict)) {
            dict[test] = [];
        }
        dict[test].push(val);
    }
    let tests = Object.keys(dict).sort(); // sort by testname

    // fragment data into
    ///// Base [30 days ago ; 7 days ago] 
    ///// Test [7 days ago ; now]

    let dictBase = {}; 
    let dictTest = {};
    let cntbase = 0, cnttest = 0;
    for ( let i = 0; i < tests.length; i++) {
        let test = tests[i];
        dictBase[test] = [];
        dictTest[test] = [];
        dict[test].sort((a,b)=> (a.dt_end > b.dt_end) ? 1 : ((b.dt_end > a.dt_end) ? -1 : 0));  // sort from oldest to recent

        let dt_latest = dict[test][ dict[test].length-1 ]['dt_end']; // get latest
        //let dt_latest = Math.round((new Date()).getTime() / 1000); // current ts in seconds


        for ( let j = 0; j < dict[test].length; j++) {
            // do fragmentation
            let dt = Math.abs(dt_latest - dict[test][j]['dt_end']); // diff in seconds
            if (dt/60/60/24 >= glob_testdays) { // everything older than X days (long term : BASE)
                dictBase[test].push(dict[test][j])
                cntbase++;
            } else { // everything else (short term : TEST)
                dictTest[test].push(dict[test][j]);
                cnttest++;
            }
        }
    }

    matrixBase = genMatrix(dictBase);
    matrixTest = genMatrix(dictTest);

    // console.log(matrixBase)
    // console.log(matrixTest)
    console.log('base:'+cntbase)
    console.log('test:'+cnttest)

    if (cnttest === 0 || cntbase === 0) {
        $('#graphParent').append('no test data (no records or outdated)');    
        return
    }


    let matrixFin = {};
    for (let testname in matrixBase) {
    for (let box in matrixBase[testname]) {
    for (let metricKey in matrixBase[testname][box]) {

        if (!(matrixBase[testname][box][metricKey]['usable']))
            continue;

        if (!(box in matrixTest[testname])) {
            break;
        }
        
        if (!(testname in matrixFin)) matrixFin[testname] = {};
        if (!(box in matrixFin[testname])) matrixFin[testname][box] = {};
        if (!(metricKey in matrixFin[testname][box])) matrixFin[testname][box][metricKey] = {};

        matrixFin[testname][box][metricKey]['name'] = matrixBase[testname][box][metricKey]['name'];
        matrixFin[testname][box][metricKey]['base_avg'] = matrixBase[testname][box][metricKey]['avg_clean'];
        matrixFin[testname][box][metricKey]['base_std'] = matrixBase[testname][box][metricKey]['std_clean'];
    

    }
    }
    }
    for (let testname in matrixTest) {
    for (let box in matrixTest[testname]) {
    for (let metricKey in matrixTest[testname][box]) {

        if (!(matrixTest[testname][box][metricKey]['usable']))
            continue;
        
        if (!(testname in matrixFin)) matrixFin[testname] = {};
        if (!(box in matrixFin[testname])) matrixFin[testname][box] = {};
        if (!(metricKey in matrixFin[testname][box])) matrixFin[testname][box][metricKey] = {};

        matrixFin[testname][box][metricKey]['name'] = matrixTest[testname][box][metricKey]['name'];
        matrixFin[testname][box][metricKey]['test_avg'] = matrixTest[testname][box][metricKey]['avg_clean'];                

        // z score
        if ('base_avg' in matrixFin[testname][box][metricKey] && 'test_avg' in matrixFin[testname][box][metricKey]) {
            let avg = matrixFin[testname][box][metricKey]['base_avg']
            let std = matrixFin[testname][box][metricKey]['base_std']
            let val = matrixFin[testname][box][metricKey]['test_avg']
            if (std == 0.0) std = 1; // z = x-u   when  std=0
            let z = (val - avg)/std ;
            matrixFin[testname][box][metricKey]['final_z'] = z;
        } 

    }
    }
    }

    let metrics_order = [];

    // console.log(JSON.parse(JSON.stringify(matrixFin)))
    for (let testname in matrixFin) {
    let results = {}; // for the specific metric
    let boxes = {}; // aggregate all metrics for the specific box ( so we can see which box has biggest effect, or all )
    for (let box in matrixFin[testname]) {
    for (let metricKey in matrixFin[testname][box]) {
        if (!('name' in matrixFin[testname][box][metricKey])) continue;

        let clean_key = matrixFin[testname][box][metricKey]['name'];
        if(!(clean_key in results)) results[clean_key]= [];

        if (!(metrics_order.includes(clean_key))) metrics_order.push(clean_key);

        let z;
        if (!('final_z' in matrixFin[testname][box][metricKey]))
            z = null;
        else
            z = matrixFin[testname][box][metricKey]['final_z'];                    
        results[clean_key].push(z);

        if(!(clean_key in boxes)) boxes[clean_key] = {};
        if(!(box in boxes[clean_key])) boxes[clean_key][box] = null;
        if (z != null)
            boxes[clean_key][box] = parseFloat(z.toFixed(4));
    }
    }
        matrixFin[testname] = results
        for (let metricKey in results) {
            let cleanArr = results[metricKey].filter(v=>v!=null);
            let z = (cleanArr.length == 0) ? null : math.mean(cleanArr) // summing the z score will be more radical, and beware of neg/pos values -- and more biased though ; use mean instead

            matrixFin[testname][metricKey] = {
                'z': z,
                'boxes': boxes[metricKey],
            }
        }
    }
    // console.log(JSON.parse(JSON.stringify(matrixFin)))

    matrixFin = Object.keys(matrixFin).map(function(key) {
      return {
            'key':key, 
            'val':matrixFin[key], 
            'sort1':math.sum(Object.values(matrixFin[key]).filter(v=>v['z']!=null).map(v=>math.abs(v['z']))), // prefer largest global z score
            'sort2':  Object.values(matrixFin[key]).filter(v=>v['z']==null).length , // prefer tests with least null values
        };
    });
    if ($("#ysortchk").prop('checked')) {
        matrixFin.sort(function(a,b) {
            return  a['sort1'] - b['sort1'];
        });
    } else {
        matrixFin.reverse()
    }

    trace = {
      x: [], 
      y: [], 
      z: [], 
      text: [],
      hoverinfo: 'text',
      colorbar: {title: 'avg(Zscores)'}, 
      colorscale: [], 
      type: 'heatmap', 
      xtype: 'array', 
      zauto: false, 
      // zmax: 9, 
      // zmin: -9
    };

    // console.log(JSON.parse(JSON.stringify(matrixFin)))
    let zmax = 0;
    let annots = [];
    for (let idx = 0; idx < matrixFin.length; idx++) {
        let testname = matrixFin[idx]['key']
        let metrics = matrixFin[idx]['val'];
        let metric_keys = metrics_order.sort();
        //console.log(JSON.parse(JSON.stringify(metric_keys)))

        let arr = [];
        let texts = [];
        for (let jdx = 0; jdx < metric_keys.length; jdx++) {
            let metricKey = metric_keys[jdx]
            if(!trace.y.includes(testname)) trace.y.push(testname);
            if(!trace.x.includes(metricKey)) trace.x.push(metricKey);   
            let z, txt;
            if (!(metricKey in metrics)) {
                z = null;
                txt = 'x: ' + metricKey+'<br>';
                txt += 'y: '+testname+'<br>';
                txt += 'z: '+z+'<br>';
            } else {
                z = metrics[metricKey]['z'];
            
                
                if (z!=null && math.abs(z) > zmax) zmax = math.abs(z); // keep track of max
                txt = 'x: ' + metricKey+'<br>';
                txt += 'y: '+testname+'<br>';
                txt += 'z: '+ (z==null?z:z.toFixed(4)) +'<br>';
                txt += 'boxes: <br>';//+ JSON.stringify() +'<br>';
                for (let box in metrics[metricKey]['boxes']) {
                    let zb =  metrics[metricKey]['boxes'][box];
                    txt += '      ' + box + ': ' + (zb==null?zb:zb.toFixed(4)) + '<br>';
                }
            }
            arr.push(z);
            texts.push(txt);

            let ann = {
                xref: 'x1',
                yref: 'y1',
                x: metricKey,
                y: testname,
                text: z==null?' ':math.abs(z).toFixed(0),
                font: {
                    family: 'Arial',
                    size: 11,
                    color: 'rgba(0,0,0,.3)'
                },
                showarrow: false,
            };
            annots.push(ann);
        }
        trace.z.push(arr);
        trace.text.push(texts)
    }
 
    zmax = 9;
    if ($("#colorscalechk").prop('checked')) {
        trace.colorscale = [
            ['0', '#00D600'], 
            [(zmax-3.0)/zmax/2 , '#82FF82'],  
            [(zmax-2.5)/zmax/2 , '#FFF'],  
            ['0.5', '#FFF'],  
            [(zmax+2.5)/zmax/2 , '#FFF'], 
            [(zmax+3.0)/zmax/2 , '#FF9191'], 
            ['1', '#E30000']
        ];
    } else {
        trace.colorscale = [
            ['0', '#00D600'], 
            ['0.5', '#FFF'],  
            ['1', '#E30000']
        ];
    }
    trace.zmax = zmax;
    trace.zmin = -zmax;
    
    // console.log(trace)
    //trace.zmax = zmax; trace.zmin = -zmax;
    data = [trace];
    layout = {
      //autosize: false, 
      title: '',
      bargap: 0.1, 
      bargroupgap: 0.1, 
      barmode: 'group', 
      boxgap: 0.1, 
      boxgroupgap: 0.1, 
      boxmode: 'overlay', 
      dragmode: 'pan', 
      font: {
        color: '#444', 
        family: '"Open sans", verdana, arial, sans-serif', 
        size: 10
      }, 
      // height: 500, 
      hidesources: false, 
      hovermode: 'x', 
      annotations: glob_annotate&&glob_annotate=='1'?annots:[], 

      margin: {
        r: 50, 
        t: 50, 
        autoexpand: true, 
        b: 100, 
        l: 100, 
        pad: 0
      }, 
      showlegend: false, 

      xaxis: {
        //side: trace.y.length > 20 ? 'top' : 'bottom',
        mirror: 'all',
        tickangle: 50,
        showgrid:false,
        fixedrange: true,
      },
      yaxis: {
        showgrid:false,
        fixedrange: true,
      },

    };

    let rows = trace.y.length;
    // console.log(rows)
    let height = 500+ rows * 15;
    let width = 900 + trace.x.length * 10;

    let graph_id = 'graph_A' ;
    $('#graphParent').append('<div id="'+graph_id+'" style="border:5px solid black; height:'+height+'px; width:'+width+'px;" ></div>');    
    let extras = {scrollZoom: true};
    Plotly.newPlot(graph_id, data, layout, extras);


    let myDiv = document.getElementById(graph_id)
    myDiv.on('plotly_click', function(data){
        // do something
    });

    $( "#graph_A .xy" ).mouseleave(function() {
        clearTimeout(wto);
    });
    myDiv.on('plotly_hover', function(data) {
        clearTimeout(wto);
        wto = setTimeout(function() {
            draw_draggable_plot({x: data.points[0].x, y: data.points[0].y});
        }, 250);

    });
}

const d3 = Plotly.d3;

window.onresize = function() {
    $("div[id^='graph_']").each(function() {
        let myDiv = d3.select( this ).node()
        Plotly.Plots.resize(myDiv);
    });
};

function genMatrix(dict) {
    let matrix = {};
    for (let testname in dict) {
        if (!(testname in matrix)) matrix[testname] = {};
        let entries = dict[testname];
        for (let i=0; i < entries.length; i++) {
            let entry = entries[i];
            let METRICS = {'phaseA_metrics':'A', 'phaseB_metrics':'B', 'phaseC_metrics':'C'}
            for (let MTC in METRICS) {

                // AGGREGATE if necessary
                if (entry[MTC].length) { 
                    let new_MTC_val = {}; // aggregate multi-index entries into one
                    for (let j=0; j < entry[MTC].length; j++) {
                        for (let metric in entry[MTC][j]) {
                            let metricKey = metric;
                            if (!(metricKey in new_MTC_val)) new_MTC_val[metricKey] = [];
                            let val = entry[MTC][j][metric];
                            if (val != null)
                                new_MTC_val[metricKey].push(val);
                        }
                    }
                    for (let metric in new_MTC_val) {
                        if (new_MTC_val[metric].length)
                            new_MTC_val[metric] = math.sum(new_MTC_val[metric]);
                        else
                            new_MTC_val[metric] = null;
                    }
                    entry[MTC] = [new_MTC_val];
                }

                // FILL MATRIX
                for (let j=0; j < entry[MTC].length; j++) {
                    if (!(entry['box'] in matrix[testname])) matrix[testname][entry['box']] = {}
                    for (let metric in entry[MTC][j]) {
                        let metricKey = MTC + '_' + metric;
                        if (!(metricKey in matrix[testname][entry['box']])) matrix[testname][entry['box']][metricKey] = {
                            'name': METRICS[MTC].length ? METRICS[MTC] + ': '+ metric : metric,
                            'data': []
                        };
                        let val = entry[MTC][j][metric];
                        if (val != null)
                            matrix[testname][entry['box']][metricKey]['data'].push(val);
                    }
                }
            }
        }
    }    

    for (let testname in matrix) {
    for (let box in matrix[testname]) {
    for (let metricKey in matrix[testname][box]) {
        matrix[testname][box][metricKey]['usable'] = false;
        if (matrix[testname][box][metricKey]['data'].length == 0) continue;
        // if (matrix[testname][box][metricKey]['data'].length < 3) continue;
        matrix[testname][box][metricKey]['usable'] = true;

        matrix[testname][box][metricKey]['avg'] = math.mean(matrix[testname][box][metricKey]['data'])
        matrix[testname][box][metricKey]['median'] = math.median(matrix[testname][box][metricKey]['data'])
        matrix[testname][box][metricKey]['mad'] = math.mad(matrix[testname][box][metricKey]['data'])
        
        matrix[testname][box][metricKey]['z_scores_mad'] = [];
        matrix[testname][box][metricKey]['data_outlierless'] = [];
        matrix[testname][box][metricKey]['data_outliers'] = [];
        for (let i=0; i < matrix[testname][box][metricKey]['data'].length; i++) {
            let val = matrix[testname][box][metricKey]['data'][i];
            if (matrix[testname][box][metricKey]['mad'] == 0)
                matrix[testname][box][metricKey]['z_scores_mad'].push(0)
            else
                matrix[testname][box][metricKey]['z_scores_mad'].push( 0.6745 * (val - matrix[testname][box][metricKey]['median']) / matrix[testname][box][metricKey]['mad'] );

            if (math.abs(matrix[testname][box][metricKey]['z_scores_mad'][i]) < 3) // retain non-outliers
                matrix[testname][box][metricKey]['data_outlierless'].push( matrix[testname][box][metricKey]['data'][i] )
            else
                matrix[testname][box][metricKey]['data_outliers'].push( matrix[testname][box][metricKey]['data'][i] )
        }

        if (!matrix[testname][box][metricKey]['data_outliers'].length)
            AD_clear_outliers_iqr(matrix[testname][box][metricKey]['data_outlierless'], matrix[testname][box][metricKey]['data_outliers']);

        matrix[testname][box][metricKey]['avg_clean'] = math.mean(matrix[testname][box][metricKey]['data_outlierless'])
        matrix[testname][box][metricKey]['std_clean'] = math.std(matrix[testname][box][metricKey]['data_outlierless'])

        matrix[testname][box][metricKey]['avg_clean'] = parseFloat(matrix[testname][box][metricKey]['avg_clean'].toFixed(6)); // fix absurd rounding issues
        matrix[testname][box][metricKey]['std_clean'] = parseFloat(matrix[testname][box][metricKey]['std_clean'].toFixed(6)); // fix absurd rounding issues
    }
    }
    }
    return matrix            
}

function AD_clear_outliers_iqr(outlierless, outliers) {
    /*
        this function requires reference to arrays, they are manipulated in-place.

        MADe is a great way to detect outliers
        however, under certain conditions it fails eg: [5,5,5,5,5, 10, 5,5,5,5,5]
        the MADe algorithm will yield median=5 and mad=0  ==> it will fail to remove the outlier `10`
        let us use IQR as a backup mechanism to detect outliers when MADe found no outliers.
        It is possible to use both mechanisms, but that might be an overkill?
    */
    let arr = outlierless.slice();
    if (!arr.length) return [];

    function iqr(arr) {
        let len = arr.length;
        if (len == 1) return
        let q1 = math.median(arr.slice(0, ~~(len / 2)));
        let q3 = math.median(arr.slice(Math.ceil(len / 2)));
        let g = 1.5;

        return (q3 - q1) * g;
    }

    arr = arr.sort(function(a, b) {
        return a - b;
    });

    let len = arr.length;
    let middle = math.median(arr);
    let iqarr = math.quantileSeq(arr, [0.25, 0.75], true);
    let range = (iqarr[1]-iqarr[0])*1.5;

    function rem(array, val) {
        let index = array.indexOf(val);
        if (index !== -1) array.splice(index, 1);
    }

    for (let i = 0; i < len; i++) {
        if (Math.abs(arr[i] - middle) <= range) {
            // no-op
        }
        else {
            rem(outlierless, arr[i]);
            outliers.push(arr[i]);
        }
    }
}

function normalize_arr(arr) {
    let max = null;
    let min = null;
    for(let x=0; x<arr.length; x++)  {
        max = max == null ? arr[x] : Math.max(max, arr[x]);
        min = min == null ? arr[x] : Math.min(min, arr[x]);
    }
    
    for(let x=0; x<arr.length; x++) {
        if (arr[x] != null)
            arr[x] = (arr[x]-min)/max*100;
    }
    return arr;
}

let current_plot_data = null;
function draw_draggable_plot(data) {
    current_plot_data = data;

    let data_key = $("#chk_data_key").prop('checked') ? 'data' : 'data_outlierless';

    let testname = data.y;
    let metric = data.x;

    let objs = []

    for (let box in matrixBase[testname]) {
        for (let _metric in matrixBase[testname][box]) {
            if (matrixBase[testname][box][_metric]['name'] == metric) {
                let entry = matrixBase[testname][box][_metric];
                fobj = objs.find( _entry => _entry['box'] === box );
                if (fobj) 
                    fobj['data'] = fobj['data'].concat(entry['data']);
                else {
                    objs.push({
                        'data': entry[data_key],
                        'box': box,
                        'type': 'base',
                    });
                }

            }
        }
    }
    for (let box in matrixTest[testname]) {
        for (let _metric in matrixTest[testname][box]) {
            if (matrixTest[testname][box][_metric]['name'] == metric) {

                let entry = matrixTest[testname][box][_metric];
                fobj = objs.find( _entry => _entry['box'] === box );
                if (fobj) 
                    fobj['data'] = fobj['data'].concat(entry['data']);
                else {
                    objs.push({
                        'data': entry[data_key],
                        'box': box,
                        'type': 'test',
                    });
                }

            }
        }
    }
    objs = JSON.parse(JSON.stringify(objs))
    
    // prepend nulls to array to make it aligned to the right side of the chart
    let max_len = null;
    for (let i = 0; i < objs.length; i++) {
        if (max_len == null || objs[i]['data'].length > max_len)
            max_len = objs[i]['data'].length;
    }
    for (let i = 0; i < objs.length; i++) {
        if (objs[i]['data'].length < max_len) {
            let nbnulls = max_len - objs[i]['data'].length;
            // console.log(nbnulls);
            for (let j = 0; j < nbnulls; j++) {
                objs[i]['data'].unshift(null);
            }
        }
    }

    
    let traces = []
    for (let i = 0; i < objs.length; i++) {
        let entry = objs[i];

        let xdata = [];
        for (let j = 0; j < entry['data'].length; j++) {
            xdata.push(j);
        }
        let trace = {
            x: xdata, 
            y: normalize_arr(entry['data']), 
            name: entry['box'],
            yaxis: 'y',
            type: 'scatter',
            mode: 'lines+markers',
            connectgaps: false,
        }
        traces.push(trace)
    }

    _draw_plot_helper(traces, testname + '<br>' + metric, data.event);
}

function _draw_plot_helper(traces, title, event) {
    if ($('#draggableParent').is(":hidden")) 
    {
        let pos = $('#graph_A').position();
        let width = $('#graph_A').outerWidth();
        $("#draggableParent").css({
            position: "absolute",
            top: 10,
            left: 10,
        }).show();
    }
    $('#draggableParent').on('click', () => {
        $("#draggableParent").css({display: 'none'})
    })

    $('#draggable').empty();
    let layout = {
        'title': title,
        "titlefont": {
            "size": 14
        },
        'margin': {
            'r': 50,
            't': 50,
            'b': 50,
            'l': 50
        },
        showlegend: true,
        dragmode: 'pan', 
        legend: {"orientation": "h"},

        xaxis: {
           showticklabels:false,
           type: 'linear',
            tickfont: {
              size: 10,
            },
            zeroline: false,
        },
        yaxis: {
            title: '',
            zeroline: false,
            showticklabels:false,
        },
    };


    Plotly.newPlot('draggable', traces, layout, {scrollZoom: true, staticPlot: true});
}

$(document).ready(function() {
    $( "#draggableParent" ).draggable().resizable({
        resize: function(e,ui) {
            const myDiv = d3.select("div[id='draggable']").node()
            Plotly.Plots.resize(myDiv);        
        }
    });

    $('#chk_data_key').on('change', function() { 
        draw_draggable_plot(current_plot_data);
    });
});
