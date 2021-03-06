// ==UserScript==
// @name         DK Art Bot
// @namespace
// @version      3.0
// @description  For DK I guess?
// @author       DK (Stolen from Union Flag Project)
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @match        https://www.reddit.com/r/place/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://raw.githubusercontent.com/jeppevinkel/DKplace-client/master/userscript.user.js
// @downloadURL  https://raw.githubusercontent.com/jeppevinkel/DKplace-client/master/userscript.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// ==/UserScript==

var socket;
var order = undefined;
// var placeOrders = [];
// var canvas = document.createElement('canvas');
var accessToken;
var currentOrderCanvas = document.createElement('canvas');
var currentOrderCtx = currentOrderCanvas.getContext('2d');
var currentPlaceCanvas = document.createElement('canvas');
var cnc_url = 'place.jeppevinkel.com'

const DEFAULT_TOAST_DURATION_MS = 10000

const COLOR_MAPPINGS = {
    '#6D001A': 0,
    '#BE0039': 1,
    '#FF4500': 2,
    '#FFA800': 3,
    '#FFD635': 4,
    '#FFF8B8': 5,
    '#00A368': 6,
    '#00CC78': 7,
    '#7EED56': 8,
    '#00756F': 9,
    '#009EAA': 10,
    '#00CCC0': 11,
    '#2450A4': 12,
    '#3690EA': 13,
    '#51E9F4': 14,
    '#493AC1': 15,
    '#6A5CFF': 16,
    '#94B3FF': 17,
    '#811E9F': 18,
    '#B44AC0': 19,
    '#E4ABFF': 20,
    '#DE107F': 21,
    '#FF3881': 22,
    '#FF99AA': 23,
    '#6D482F': 24,
    '#9C6926': 25,
    '#FFB470': 26,
    '#000000': 27,
    '#515252': 28,
    '#898D90': 29,
    '#D4D7D9': 30,
    '#FFFFFF': 31,
}

let getRealWork = (rgbaOrder) => {
    let order = []
    for (var i = 0; i < 4000000; i++) {
        if (rgbaOrder[i * 4 + 3] !== 0) {
            order.push(i)
        }
    }
    return order
}

let getPendingWork = (work, rgbaOrder, rgbaCanvas) => {
    let pendingWork = []
    for (const i of work) {
      // pendingWork.push(i)
      // continue
        if (rgbaOrderToHex(i, rgbaOrder) !== rgbaOrderToHex(i, rgbaCanvas)) {
            pendingWork.push(i)
        }
    }
    return pendingWork
}

(async function () {
    GM_addStyle(GM_getResourceText('TOASTIFY_CSS'))
    currentOrderCanvas.width = 2000
    currentOrderCanvas.height = 2000
    currentOrderCanvas.style.display = 'none'
    currentOrderCanvas = document.body.appendChild(currentOrderCanvas)
    currentPlaceCanvas.width = 2000
    currentPlaceCanvas.height = 2000
    currentPlaceCanvas.style.display = 'none'
    currentPlaceCanvas = document.body.appendChild(currentPlaceCanvas)
    // canvas.width = 2000
    // canvas.height = 2000
    // canvas.style.display = 'none'
    // canvas = document.body.appendChild(canvas)

    Toastify({
        text: 'Getting Access Token...',
        duration: DEFAULT_TOAST_DURATION_MS,
    }).showToast()

    accessToken = await getAccessToken()

    Toastify({
        text: 'Collected!!',
        duration: DEFAULT_TOAST_DURATION_MS,
    }).showToast()

    connectSocket()
    attemptPlace()

    setInterval(async () => {
        if (socket) {
            const progress = await getProgress()
            if (progress.percentComplete >= 0) socket.send(JSON.stringify({type: 'progress', progress: progress.percentComplete, pendingPixels: progress.pendingPixels}))
        }
    }, 10000)
    setInterval(async () => {
        accessToken = await getAccessToken()
    }, 30 * 60 * 1000)
})()

function connectSocket() {
    Toastify({
        text: 'Connecting to Union Flag server...',
        duration: DEFAULT_TOAST_DURATION_MS,
    }).showToast()

    socket = new WebSocket(`wss://${cnc_url}/ws`)

    socket.onopen = function () {
        Toastify({
            text: 'Connected!',
            duration: DEFAULT_TOAST_DURATION_MS,
        }).showToast()
        socket.send(JSON.stringify({type: 'getmap'}))
        socket.send(JSON.stringify({type: 'brand', brand: 'userscriptV20'}))
    }

    socket.onmessage = async function (message) {
        var data
        try {
            data = JSON.parse(message.data)
        } catch (e) {
            return
        }

        switch (data.type.toLowerCase()) {
            case 'map':
                Toastify({
                    text: `New map loaded (Reason: ${
                        data.reason ? data.reason : 'connected to server'
                    })...`,
                    duration: DEFAULT_TOAST_DURATION_MS,
                }).showToast()
                currentOrderCtx = await getCanvasFromUrl(
                    `https://${cnc_url}/maps/${data.data}`,
                    currentOrderCanvas,
                    0,
                    0,
                    true,
                )
                order = getRealWork(currentOrderCtx.getImageData(0, 0, 2000, 2000).data)
                Toastify({
                    text: `New map loaded, ${order.length} pixels in total`,
                    duration: DEFAULT_TOAST_DURATION_MS,
                }).showToast()
                break
            case 'toast':
                Toastify({
                    text: `Message from server: ${data.message}`,
                    duration: data.duration || DEFAULT_TOAST_DURATION_MS,
                    style: data.style || {},
                }).showToast()
                break
            default:
                break
        }
    }

    socket.onclose = function (e) {
        Toastify({
            text: `Unoin Flag Server Disconnected: ${e.reason}`,
            duration: DEFAULT_TOAST_DURATION_MS,
        }).showToast()
        console.error('Socket timeout: ', e.reason)
        socket.close()
        setTimeout(connectSocket, 1000)
    }
}

function shuffleWeighted(array) {
	for (const item of array) {
		item.rndPriority = Math.round(placeOrders.priorities[item.priority] * Math.random());
	}
	array.sort((a, b) => b.rndPriority - a.rndPriority);
}

function getPixelList() {
	const structures = [];
	if (Date.now() > 1649133000 * 1000) {
		structures.push(placeOrders.structues["overwrite"])
	} else {
		for (const structureName in placeOrders.structures) {
			if (structureName != "overwrite") {
				shuffleWeighted(placeOrders.structures[structureName].pixels);
				structures.push(placeOrders.structures[structureName]);
			}
		}
		shuffleWeighted(structures);
	}
	return structures.map(structure => structure.pixels).flat();
}

async function attemptPlace() {
    if (order == undefined) {
        setTimeout(attemptPlace, 10000) // probeer opnieuw in 2sec.
        return
    }
    var ctx
    try {
        ctx = await getCanvasFromUrl(
            await getCurrentImageUrl('0'),
            currentPlaceCanvas,
            0,
            0,
            false,
        )
        ctx = await getCanvasFromUrl(
            await getCurrentImageUrl('1'),
            currentPlaceCanvas,
            1000,
            0,
            false,
        )
        ctx = await getCanvasFromUrl(
            await getCurrentImageUrl('2'),
            currentPlaceCanvas,
            0,
            1000,
            false,
        )
        ctx = await getCanvasFromUrl(
            await getCurrentImageUrl('3'),
            currentPlaceCanvas,
            1000,
            1000,
            false,
        )
    } catch (e) {
        console.warn('Error retrieving map: ', e)
        Toastify({
            text: 'Error retrieving map. Try again in 10 sec...',
            duration: DEFAULT_TOAST_DURATION_MS,
        }).showToast()
        setTimeout(attemptPlace, 10000) // Try again in 10sec.
        return
    }

    const rgbaOrder = currentOrderCtx.getImageData(0, 0, 2000, 2000).data
    const rgbaCanvas = ctx.getImageData(0, 0, 2000, 2000).data
    // const rgbaCanvas = ''
    const work = getPendingWork(order, rgbaOrder, rgbaCanvas)

    if (work.length === 0) {
        Toastify({
            text: `All pixels are already in the right place! Try again in 30 sec...`,
            duration: 30000,
        }).showToast()
        setTimeout(attemptPlace, 30000) // Try again in 30sec.
        return
    }

    const percentComplete = 100 - Math.ceil((work.length * 100) / order.length)
    // const percentComplete = 'NaN'
    const workRemaining = work.length
    const idx = Math.floor(Math.random() * work.length)
    const i = work[idx]
    const x = i % 2000
    const y = Math.floor(i / 2000)
    const hex = rgbaOrderToHex(i, rgbaOrder)

    Toastify({
        text: `Trying to place pixel ${x}, ${y}... (${percentComplete}% complete, ${workRemaining} left)`,
        duration: DEFAULT_TOAST_DURATION_MS,
    }).showToast()

    console.log(
        `Trying to place pixel ${x}, ${y}... (${percentComplete}% complete, ${workRemaining} left)`,
    )

    const res = await place(x, y, COLOR_MAPPINGS[hex])
    const data = await res.json()
    try {
        if (data.errors) {
            const error = data.errors[0]
            console.log('data.errors :>> ', data.errors)
            try {
                const nextPixel = error.extensions.nextAvailablePixelTs + 3000
                const nextPixelDate = new Date(nextPixel)
                
                if (nextPixelDate.getTime() != nextPixelDate.getTime()) {
                  let d = new Date(Date.now() + 10000);
                  let delay = d.getTime() - Date.now();
                  
                  Toastify({
                    text: `You are on cooldown! Trying again at ${d.toLocaleTimeString()}.`,
                    duration: delay,
                  }).showToast()
                  setTimeout(attemptPlace, delay)
                  return
                }
                
                const delay = nextPixelDate.getTime() - Date.now()
                const toast_duration = delay > 0 ? delay : DEFAULT_TOAST_DURATION_MS
                Toastify({
                    text: `You are on cooldown! Next pixel at ${nextPixelDate.toLocaleTimeString()}.`,
                    duration: toast_duration,
                }).showToast()
                setTimeout(attemptPlace, delay)
            } catch (e) {
                console.log("If you ignore it it doesn't exist." + e)
                Toastify({
                    text: `You are on cooldown!`,
                    duration: 10000,
                }).showToast()
                setTimeout(attemptPlace, 20000)
            }
        } else {
            const nextPixel =
                data.data.act.data[0].data.nextAvailablePixelTimestamp + 3000
            const nextPixelDate = new Date(nextPixel)
            const delay = nextPixelDate.getTime() - Date.now()
            const toast_duration = delay > 0 ? delay : DEFAULT_TOAST_DURATION_MS
            console.log(
                `Pixel placed at ${x}, ${y}! Next pixel will be placed at ${nextPixelDate.toLocaleTimeString()}`,
            )
            Toastify({
                text: `Pixel placed at ${x}, ${y}! Next pixel will be placed at ${nextPixelDate.toLocaleTimeString()}. Click to zoom to placed pixel`,
                duration: toast_duration,
                destination: `https://www.reddit.com/r/place/?cx=${x}&cy=${y}&px=2`,
                newWindow: true,
            }).showToast()
            setTimeout(attemptPlace, delay)
        }
    } catch (e) {
        console.warn('Response analysis error', e)
        Toastify({
            text: `Response analysis error: ${e}.`,
            duration: DEFAULT_TOAST_DURATION_MS,
        }).showToast()
        setTimeout(attemptPlace, 10000)
    }
}

async function place(x, y, color) {
    socket.send(JSON.stringify({type: 'placepixel', x, y, color}))
    return await fetch('https://gql-realtime-2.reddit.com/query', {
        method: 'POST',
        body: JSON.stringify({
            operationName: 'setPixel',
            variables: {
                input: {
                    actionName: 'r/replace:set_pixel',
                    PixelMessageData: {
                        coordinate: {
                            x: x % 1000,
                            y: y % 1000,
                        },
                        colorIndex: color,
                        canvasIndex: getCanvasId(x, y),
                    },
                },
            },
            query:
                `mutation setPixel($input: ActInput!) {
				act(input: $input) {
					data {
						... on BasicMessage {
							id
							data {
								... on GetUserCooldownResponseMessageData {
									nextAvailablePixelTimestamp
									__typename
								}
								... on SetPixelResponseMessageData {
									timestamp
									__typename
								}
								__typename
							}
							__typename
						}
						__typename
					}
					__typename
				}
			}
			`,
        }),
        headers: {
            origin: 'https://hot-potato.reddit.com',
            referer: 'https://hot-potato.reddit.com/',
            'apollographql-client-name': 'mona-lisa',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    }).catch((error) => console.error('Error placing Pixel: ', error))
}

function getCanvasId(x,y) {
	return (x > 1000) + (y > 1000)*2
}

async function getProgress() {
  console.log('Sending progress...')
    if (order == undefined) {
        return -1;
    }
    var ctx;
    try {
        ctx = await getCanvasFromUrl(await getCurrentImageUrl('0'), currentPlaceCanvas, 0, 0, false);
        ctx = await getCanvasFromUrl(await getCurrentImageUrl('1'), currentPlaceCanvas, 1000, 0, false)
        ctx = await getCanvasFromUrl(await getCurrentImageUrl('2'), currentPlaceCanvas, 0, 1000, false)
        ctx = await getCanvasFromUrl(await getCurrentImageUrl('3'), currentPlaceCanvas, 1000, 1000, false)
    } catch (e) {
        return -2;
    }

    const rgbaOrder = currentOrderCtx.getImageData(0, 0, 2000, 2000).data;
    const rgbaCanvas = ctx.getImageData(0, 0, 2000, 2000).data;
    const work = getPendingWork(order, rgbaOrder, rgbaCanvas);
    const pendingPixels = []
  
    for (const curWork of work) {
      const x = curWork % 2000
      const y = Math.floor(curWork / 2000)
      pendingPixels.push({
        x,
        y
      })
    }

    const percentComplete = 100 - (work.length * 100 / order.length);
  
  return {
    percentComplete,
    pendingPixels
  };
}

async function getAccessToken() {
    const usingOldReddit = window.location.href.includes('new.reddit.com')
    const url = usingOldReddit
        ? 'https://new.reddit.com/r/place/'
        : 'https://www.reddit.com/r/place/'
    const response = await fetch(url)
    const responseText = await response.text()

    // TODO: ew
    return responseText.split('"accessToken":"')[1].split('"')[0]
}

async function getCurrentImageUrl(id = '0') {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(
            'wss://gql-realtime-2.reddit.com/query',
            'graphql-ws',
        )

        ws.onopen = () => {
            ws.send(
                JSON.stringify({
                    type: 'connection_init',
                    payload: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }),
            )
            ws.send(
                JSON.stringify({
                    id: '1',
                    type: 'start',
                    payload: {
                        variables: {
                            input: {
                                channel: {
                                    teamOwner: 'AFD2022',
                                    category: 'CANVAS',
                                    tag: id,
                                },
                            },
                        },
                        extensions: {},
                        operationName: 'replace',
                        query:
                            `subscription replace($input: SubscribeInput!) {
						subscribe(input: $input) {
							id
							... on BasicMessage {
								data {
									__typename
									... on FullFrameMessageData {
										__typename
										name
										timestamp
									}
								}
								__typename
							}
							__typename
						}
					}
					`,
                    },
                }),
            )
        }

        ws.onmessage = (message) => {
            const {data} = message
            const parsed = JSON.parse(data)

            // TODO: ew
            if (
                !parsed.payload ||
                !parsed.payload.data ||
                !parsed.payload.data.subscribe ||
                !parsed.payload.data.subscribe.data
            )
                return

            ws.close()
            resolve(
                parsed.payload.data.subscribe.data.name +
                `?noCache=${Date.now() * Math.random()}`,
            )
        }

        ws.onerror = reject
    })
}

function getCanvasFromUrl(url, canvas, x = 0, y = 0, clearCanvas = false) {
  return new Promise((resolve, reject) => {
    let loadImage = (ctx) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: url,
        responseType: 'blob',
        onload: function(response) {
        var urlCreator = window.URL || window.webkitURL;
        console.log(response.response)
        var imageUrl = urlCreator.createObjectURL(response.response);
        console.log(imageUrl)
        var img = new Image()
        img.onload = () => {
          if (clearCanvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }
          ctx.drawImage(img, x, y)
          resolve(ctx)
        }
        img.onerror = () => {
          Toastify({
            text: 'Error retrieving folder. Try again in 3 sec...',
            duration: 3000,
          }).showToast()
          setTimeout(() => loadImage(ctx), 3000)
        }
        img.src = imageUrl;
    }
  })
  }
    loadImage(canvas.getContext('2d'))
  })
}

function rgbToHex(r, g, b) {
    return (
        '#' +
        ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
    )
}

let rgbaOrderToHex = (i, rgbaOrder) =>
    rgbToHex(rgbaOrder[i * 4], rgbaOrder[i * 4 + 1], rgbaOrder[i * 4 + 2])
