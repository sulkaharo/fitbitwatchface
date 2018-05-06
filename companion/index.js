// Import the messaging module
import * as messaging from "messaging";
import { encode } from 'cbor';
import { outbox } from "file-transfer";
import { settingsStorage } from "settings";
import { me } from "companion";


// // default URL pointing at xDrip Plus endpoint
 var URL = null;

let lastKnownRecordDate = 0;
let lastFetch = 0;

function queryBGD() {
  let url = getSgvURL()
  console.log(url)
  return fetch(url)
  .then(function (response) {
      return response.json()
      .then(function(data) {
        let date = new Date();
       
        let currentBgDate = new Date(data[0].dateString);
        
        let recordDate = currentBgDate.getTime();
        
        if (recordDate > lastKnownRecordDate) {lastKnownRecordDate = recordDate };

        /*
        let diffMs =date.getTime() - JSON.stringify(data[0].date) // milliseconds between now & today              
        if(isNaN(diffMs)) {
           console.log('Not a number set to 5 mins')
           diffMs = 300000
        } else {
          // If the time sense last pull is larger then 15mins send false to display error
          if(diffMs > 900000) {
            diffMs = false
          }else {
             if(diffMs > 300000) {
              diffMs = 300000
            } else {
              diffMs = Math.round(300000 - diffMs) + 60000 // add 1 min to account for delay in communications 
            }

          }
        }
        */
        
        let bloodSugars = []
        
        // if there is no delta calc it 
        let delta = 0;
        //let count = data.length - 1;
        if(!data[0].delta) {
          //console.log("D1: " + data[0].sgv);
          //console.log("D2: " + data[1].sgv);
          
          delta = data[0].sgv - data[1].sgv 
        }
        
        data.forEach(function(bg, index){
           bloodSugars.push({
             sgv: bg.sgv,
             direction: bg.direction,
             date: bg.date,
             delta: ((Math.round(bg.delta)) ? Math.round(bg.delta) : delta),
             units_hint: ((bg.units_hint) ? bg.units_hint : 'mgdl')

          })
        })   
        // Send the data to the device
        return bloodSugars.reverse();
      });
  })
  .catch(function (err) {
    console.log("Error fetching bloodSugars: " + err);
  });
}


// Send the BG data to the device
function returnData(data) {  
  const myFileInfo = encode(data);
  outbox.enqueue('file.txt', myFileInfo);
   
}

function formatReturnData() {
  
  // Only do a fetch if 5 minutes and 10 seconds has passed
  // Only do one fetch / 60 seconds after that
  
  console.log("Checking if fetch is needed");
  
  let dateNow = (new Date()).getTime();
  if ((dateNow - lastKnownRecordDate) < (5*60*1000 + 10000)) { return; }
  if ((dateNow - lastFetch) < (2 * 60*1000)) { return; }
  
  lastFetch = dateNow;

    console.log("Fetching Data...");
  
    let BGDPromise = new Promise(function(resolve, reject) {
      resolve( queryBGD() );
    });
    let highThreshold = null;
    let lowThreshold = null;
    
    if(getSettings("highThreshold")){
      highThreshold = getSettings("highThreshold").name;
    }
    if(getSettings("highThreshold").name === ""){
      highThreshold = 200;
    }
  
    if(getSettings("lowThreshold")){
     lowThreshold = getSettings("lowThreshold").name
    }
    if(getSettings("lowThreshold").name === ""){
     lowThreshold = 70
    }
  
    let units = settingsStorage.getItem('usemgdl') === 'true' ? 'mgdl' : 'mmol';
  
    if (units == 'mmol') {
      lowThreshold = lowThreshold * 18;
      highThreshold = highThreshold * 18;      
    }
    
    Promise.all([BGDPromise]).then(function(values) {
      let dataToSend = {
        'BGD':values[0],
        'settings': {
          'bgColor': getSettings('bgColor'),
          'highThreshold': highThreshold,
          'lowThreshold': lowThreshold,
          'timeFormat' : getSettings('timeFormat'),
          'units' : units
        }
      }
      returnData(dataToSend)
    });
  }


// Listen for messages from the device
messaging.peerSocket.onmessage = function(evt) {
  if (evt.data) {
    formatReturnData()
  }
}


setInterval(formatReturnData, 15 * 1000);

// Listen for the onerror event
messaging.peerSocket.onerror = function(err) {
  // Handle any errors
  console.log("Connection error: " + err.code + " - " + err.message);
}


//----------------------------------------------------------
//
// This section deals with settings
//
//----------------------------------------------------------
settingsStorage.onchange = function(evt) {
 console.log( getSettings(evt.key) )
    formatReturnData()
}

// getters 
function getSettings(key) {
  if(settingsStorage.getItem( key )) {
    return JSON.parse(settingsStorage.getItem( key ));
  } else {
    return undefined
  }
}

function getSgvURL() {
  if(getSettings('endpoint').name) {
    return getSettings('endpoint').name+"?count=24"
  } else {
    // Default xDrip web service 
    return  "http://127.0.0.1:17580/sgv.json"
  }
}
