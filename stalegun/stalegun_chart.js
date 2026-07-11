var firstPoint = Date.now()+120;
        
const startTime = Date.now();

var hiddenLines = ['$5k spread']; 

const exchanges = ['hyperliquid', 'binance futures', 'binance spot', 'stalegun'];

const datasetTypes = ['trades', 'bid-ask', '$5k spread'];

const buyOptions = [true, false];

const reqLiq = 5000;
const dataWindow = 30000; // 30 seconds of data

const stepSizeMs = 10000; // 5 second

// Get the coin from URL parameters
const urlParams = new URLSearchParams(window.location.search);

var coinParam = urlParams.get('coin') || 'BTC'; 
const coins = ['AAVE', 'ACE', 'ADA', 'AI', 'ALT', 'APE', 'APT', 'AR', 'ARB', 'ARK', 'ATOM', 'AVAX', 'BADGER', 'BANANA', 'BCH', 'BIGTIME', 'BLUR', 'BLZ', 'BNB', 'BNT', 'BOME', 'BRETT', 'BSV', 'BTC', 'CAKE', 'CFX', 'COMP', 'CRV', 'CYBER', 'DOGE', 'DOT', 'DYDX', 'DYM', 'ENA', 'ENS', 'ETC', 'ETH', 'ETHFI', 'FET', 'FIL', 'FTM', 'FTT', 'FXS', 'GALA', 'GAS', 'GMT', 'GMX', 'HBAR', 'HYPE', 'ILV', 'IMX', 'INJ', 'IO', 'JTO', 'JUP', 'KAS', 'LDO', 'LINK', 'LISTA', 'LOOM', 'LTC', 'MANTA', 'MATIC', 'MAV', 'MAVIA', 'MEME', 'MEW', 'MINA', 'MKR', 'MYRO', 'NEAR', 'NEO', 'NOT', 'NTRN', 'OGN', 'OMNI', 'ONDO', 'OP', 'ORBS', 'ORDI', 'PENDLE', 'PEOPLE', 'PIXEL', 'POLYX', 'POPCAT', 'PYTH', 'RDNT', 'RENDER', 'REZ', 'RSR', 'RUNE', 'SAGA', 'SEI', 'SNX', 'SOL', 'STG', 'STRAX', 'STRK', 'STX', 'SUI', 'SUPER', 'SUSHI', 'TAO', 'TIA', 'TNSR', 'TON', 'TRB', 'TRX', 'TURBO', 'UMA', 'UNI', 'USTC', 'W', 'WIF', 'WLD', 'XAI', 'XRP', 'YGG', 'ZEN', 'ZETA', 'ZK', 'ZRO'];


const colorHL = '#35d07f';
const colorBN = '#ff6b6b';
const colorBNSpot = '#ffd37a';
const colorStalegun = '#A444BE';
const colorDark = '#FFFFFF11';

const colorTrans = '#000000';

const venueDtypeMapping = {};
	
const locToStr = ( venue, dtype, side) =>{
	return venue + 'x' +dtype+ 'x' + (side? 'b':'s');
}

const addData = (venue, dtype, side, time, value, quantity)  => {
     	   firstPoint = Math.min(firstPoint, time)
	const key = locToStr(venue, dtype, side);
	const dataset = venueDtypeMapping[key];
	if (!dataset || !dataset.data) {
		console.warn(`Dataset not found for ${key}, skipping data`);
		return;
	}
	dataset.data.push({x: time, y: value});
	if ((venue==='binance futures') || (venue==='hyperliquid') ){ 
		addStalegunData()
	}
	// Add to trade tape if it's a trade (but not stalegun/inferred hl price)
	if (dtype === 'trades' && venue !== 'stalegun' && typeof appendTradeToTape === 'function') {
		appendTradeToTape(venue, time, value, side, quantity);
	}
}

const createUnifiedDataset = (venue, dtype, buy) => {
  let color;
  switch (venue) {
    case 'hyperliquid':
      color = colorHL;
      break;
    case 'binance futures':
      color = colorBN;
      break;
    case 'binance spot':
      color = colorBNSpot;
      break;
    case 'stalegun':
      color = colorStalegun;
      break;
    default:
      console.warn(`Unknown venue: ${venue}`);
      color = '#000000'; // Default color
  }

  const baseDataset = {
    venue,
    dtype,
    data: [],
    borderColor: color,
    borderWidth: 2,
    pointRadius: 0,
    stepped: true
  };

  let specificDataset = {};
  let linewidth = venue == 'stalegun' ? 4: 1;

  switch (dtype) {
    case 'trades':
      specificDataset = {
        pointRadius: 7,
        pointStyle: 'triangle',
        pointBackgroundColor: colorTrans,
        pointRotation: buy ? 0 : 180,
        showLine: false
      };
      break;
    case 'bid-ask':
    case '$5k spread':
      specificDataset = {
        backgroundColor: `${color}20`,
        borderColor: `${color}77`,
        borderWidth: linewidth,
        fill: buy ? "+1" : "-1"
      };
      break;
    default:
      console.warn(`Unknown dtype: ${dtype}`);
  }

  const newDataset = { ...baseDataset, ...specificDataset };
  venueDtypeMapping[locToStr(venue, dtype, buy)] = newDataset;
  return newDataset;
};

const datasets = exchanges.flatMap(exchange => 
  datasetTypes.flatMap(dtype => 
    buyOptions.map(buy => createUnifiedDataset(exchange, dtype, buy))
  )
)  

function customTickGenerator(min, max, stepSize) {
    const ticks = [];
    let curr = Math.ceil(0.25 + min / stepSize) * stepSize;
    while (curr <= max - stepSize/4) {
        ticks.push({
            value: curr,
            label: new Date(curr).toISOString(),  
            major: false
        });
        curr += stepSize;
    }
    return ticks;
}

// Map legend text to venue names
const legendToVenueMap = {
    'hyperliquid': 'hyperliquid',
    'binance futures': 'binance futures',
    'binance spot': 'binance spot',
    'inferred hl price': 'stalegun'
};

function updateChartData(chart) {
        for (let i = 0; i < chart.data.datasets.length; i++) {
        	const meta = chart.getDatasetMeta(i);
	        const venue = meta._dataset.venue;
	        const dtype = meta._dataset.dtype;
	        // Check if venue is hidden (either by venue name or legend text)
	        const isVenueHidden = hiddenLines.includes(venue) || 
	                             hiddenLines.some(hidden => legendToVenueMap[hidden] === venue);
	        meta.hidden = isVenueHidden || hiddenLines.includes(dtype);
        }        
	chart.update();
}

Chart.defaults.color = '#FFFFFF';

const ctx = document.getElementById('coinChart').getContext('2d');
ctx.globalCompositeOperation = 'destination-over';

const coinChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: datasets },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'second',
                    displayFormats: {
                        second: 'HH:mm:ss'
                    },
                },
                ticks: {
                    source: 'data',
                    autoSkip: false,
                    maxRotation: 0,
                },
                afterBuildTicks: function(scale) {
                    scale.ticks = customTickGenerator(scale.min, scale.max, stepSizeMs);
                },
		grid: { 
		    color: colorDark
		},
            },
            y: {
		grid: { 
		    color: colorDark
		},
            }
        },
        plugins: {
            tooltip: {
                enabled: false
            },
            legend: {
                display: false
            }
        }
    }
});

// Custom legend
const legendItems = [
    { text: 'hyperliquid', color: colorHL, style: 'square'},
    { text: 'binance futures', color: colorBN, style: 'square'},
    { text: 'binance spot', color: colorBNSpot, style: 'square'},
    { text: 'inferred hl price', color: colorStalegun, style: 'square'},
    { text: 'trades', color: 'white', style: 'circle' },
    { text: '$5k spread', color: 'rgba(255,255,255,0.3)', style: 'square' },
    { text: 'bid-ask', color: 'rgba(255,255,255,0.3)', style: 'square'}
];

const legendContainer = document.getElementById('custom-legend');
legendItems.forEach((item, index) => {
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    
    const color = document.createElement('div');
    color.className = 'legend-color';
    color.style.backgroundColor = item.color;

    const text = document.createElement('span');
    text.className = 'legend-text';
    text.textContent = item.text;
    
    legendItem.appendChild(color);
    legendItem.appendChild(text);
    legendContainer.appendChild(legendItem);
    
    legendItem.onclick = function() {
        const itemText = item.text;
        if (hiddenLines.includes(itemText)) {
            hiddenLines = hiddenLines.filter(elem => elem !== itemText);
        } else { 
            hiddenLines.push(itemText);
        }
        
        updateChartData(coinChart);

    };
});

function updateChart(currentTime) {
    const oldestAllowedTime = currentTime - dataWindow * 1.5;

    coinChart.data.datasets.forEach(dataset => {
        let i = 0;
        while (i < dataset.data.length && dataset.data[i].x < oldestAllowedTime) {
            i++;
        }
        if (i > 0) {
            dataset.data.splice(0, i);
        }
    });

    coinChart.options.scales.x.min =  currentTime - dataWindow;
    coinChart.options.scales.x.max = currentTime;

    coinChart.update('none');
}

        // Smooth scrolling update loop
function smoothScroll() {
    const currentTime = Date.now();
    updateChart(currentTime);
    requestAnimationFrame(smoothScroll);
}

updateChartData(coinChart);

smoothScroll(); // Start the smooth scrolling
