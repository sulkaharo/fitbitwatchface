// Imports
import clock from "clock";
import * as messaging from "messaging";
import document from "document";
import { inbox } from "file-transfer";
import fs from "fs";
import * as fs from "fs";
import { vibration } from "haptics";
import { preferences } from "user-settings";
import Graph from "graph.js"
import { today } from "user-activity";
import { HeartRateSensor } from "heart-rate";

// Update the clock every minute
clock.granularity = "minutes";

// Variables
let highThreshold = 200;
let lowThreshold =  70;
let arrowIcon = {"Flat":"\u{2192}","DoubleUp":"\u{2191}\u{2191}","SingleUp":"\u{2191}","FortyFiveUp":"\u{2197}","FortyFiveDown":"\u{2198}","SingleDown":"\u{2193}","DoubleDown":"\u{2193}\u{2193}","None":"-","NOT COMPUTABLE":"-","RATE OUT OF RANGE":"-"};
let minsAgo = 0;
let minsAgoText = "mins ago";
let showAlertModal = true;

let units = 'mgdl';

let lastUpdateTime = 0;

// Handles to GUI Elements
let time = document.getElementById("time");
let steps = document.getElementById("steps");
let hrLabel = document.getElementById("heartrate");

hrLabel.text = "--";
steps.text = "--";

let sgv = document.getElementById("sgv");
let dirArrow = document.getElementById("dirArrow");

let delta = document.getElementById("delta");
let age = document.getElementById("age");

let scale1 = document.getElementById("scale1");
let scale2 = document.getElementById("scale2");
let scale3 = document.getElementById("scale3");
let scale4 = document.getElementById("scale4");


let docGraph = document.getElementById("docGraph");
let myGraph = new Graph(docGraph);



// converts a mg/dL to mmoL
function mmol( bg ) {
    let mmolBG = Math.round( (0.0556 * bg) * 10 ) / 10;
  return mmolBG;
}

// converts mmoL to  mg/dL 
function  mgdl( bg ) {
    let mgdlBG = Math.round( (bg * 18) / 10 ) * 10;
  return mgdlBG;
}

//----------------------------------------------------------
//
// This section is for displaying the heart rate
//
//----------------------------------------------------------

// Create a new instance of the HeartRateSensor object
var hrm = new HeartRateSensor();

// Declare a even handler that will be called every time a new HR value is received.
hrm.onreading = function() {
  // Peek the current sensor values
  console.log("Current heart rate: " + hrm.heartRate);
  hrLabel.text = hrm.heartRate;
 // lastValueTimestamp = Date.now();
}

// Begin monitoring the sensor
hrm.start();


//----------------------------------------------------------
//
// This section deals with getting data from the companion app 
//
//----------------------------------------------------------
// Request data from the companion
function fetchCompanionData(cmd) {
  //setStatusImage('refresh.png')
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    // Send a command to the companion
    messaging.peerSocket.send({
      command: cmd
    });
  }
}


// Display the  data received from the companion
function processOneBg(data) {
  console.log("bg is: " + JSON.stringify(data));
  
  
  if(data) {
    
    let tcolor = "white";
    
    if (data.sgv >= highThreshold){
      tcolor = "red";
    }
    else if (data.sgv <= lowThreshold){
      tcolor = "red";
    }
    else{
      tcolor = "green";
    }
    
    sgv.text = mmol(data.sgv);
    sgv.style.fill = tcolor;
    
    dirArrow.text = arrowIcon[data.direction];
    dirArrow.style.fill = tcolor;
    
    minsAgo = data.date;
    minsAgoText = Math.round((Date.now()-minsAgo)/60000);
    age.text = `${minsAgoText} mins ago`;
    
    if (data.delta > 0){
      //console.log(`DELTA: +${data.delta} mg/dl`);
      delta.text = `+${mmol(data.delta)} mmol`;   
    } else {
      //console.log(`DELTA: ${data.delta} mg/dl`);
      delta.text = `${mmol(data.delta)} mmol`;   
    }
    
   
  } else {
    sgv.text = '???'
    sgv.style.fill = "red";
    dirArrow.text = '-'
    dirArrow.style.fill = "red";
    // call function every 10 or 15 mins to check again and see if the data is there   
    //setTimeout(fiveMinUpdater, 900000)    
  }
}


// Event occurs when new file(s) are received
inbox.onnewfile = () => {
  let fileName;
  do {
    // If there is a file, move it from staging into the application folder
    fileName = inbox.nextFile();
    if (fileName) {
    
      readSGVFile(fileName);       
    }
  } while (fileName);
};

function readSGVFile(filename) {
      
      //if (!fs.existsSync(filename)) {return;}
  
      const data = fs.readFileSync(filename, 'cbor');  
      let count = data.BGD.length - 1;
      //document.getElementById("bg").style.fill="white"
      // High || Low alert
   
      if(data.BGD[count].sgv >=  data.settings.highThreshold) {
        if((data.BGD[count].delta > 0)){
          console.log('BG HIGH'); 
          startVibration("nudge", 3000, data.BGD[count].sgv);
          //document.getElementById("bg").style.fill="#e2574c"
        } else {
          console.log('BG still HIGH, But you are going down'); 
          showAlertModal = true;
        }
      }
      
      if(data.BGD[count].sgv <=  data.settings.lowThreshold) {
         if((data.BGD[count].delta < 0)){
            console.log('BG LOW');
           
            startVibration("nudge", 3000, data.BGD[count].sgv);
            //document.getElementById("bg").style.fill="#e2574c"
           } else {
          console.log('BG still LOW, But you are going UP'); 
          showAlertModal = true;
        }
      }
      //EMD High || Low alert      
    
      processOneBg(data.BGD[count]);
     
  
      settings(data.settings);

      
      // Added by NiVZ    
      let ymin = 999;
      let ymax = 0;
      
      data.BGD.forEach(function(bg, index) {
        if (bg.sgv < ymin) { ymin = bg.sgv; }
        if (bg.sgv > ymax) { ymax = bg.sgv; }
      })
      
      ymin -=20;
      ymax +=20;
            
      ymin = Math.floor((ymin/10))*10;
      ymax = Math.floor(((ymax+9)/10))*10;
            
      ymin = ymin < 40 ? ymin : 40;
      ymax = ymax < 180 ? 180 : ymax;      
      
      scale1.text = mmol(ymax);
      scale2.text = mmol(Math.floor(ymin + ((ymax-ymin) *0.66)));
      scale3.text = mmol(Math.floor(ymin + ((ymax-ymin) *0.33)));
      scale4.text = mmol(ymin);
            
      // Set the graph scale
      myGraph.setYRange(ymin, ymax);
      // Update the graph
      myGraph.update(data.BGD);  
     
}

// Listen for the onerror event
messaging.peerSocket.onerror = function(err) {
  // Handle any errors
  console.log("Connection error: " + err.code + " - " + err.message);
}


//----------------------------------------------------------
//
// Settings
//
//----------------------------------------------------------
function settings(settings){
  //timeFormat = settings.timeFormat
  highThreshold = settings.highThreshold;
  lowThreshold =  settings.lowThreshold;
  units = settings.units;

  if(settings.units === "mmol") {
    highThreshold = mgdl( settings.highThreshold )
    lowThreshold = mgdl( settings.lowThreshold )
  }
  
}

//----------------------------------------------------------
//
// Deals with Vibrations 
//
//----------------------------------------------------------
let vibrationTimeout; 

function startVibration(type, length, message) {
  if(showAlertModal){
    showAlert(message) 
    vibration.start(type);
    if(length){
       vibrationTimeout = setTimeout(function(){ startVibration(type, length, message) }, length);
    }
  }
  
}

function stopVibration() {
  vibration.stop();
  clearTimeout(vibrationTimeout);
}
//----------------------------------------------------------
//
// Alerts
//
//----------------------------------------------------------
let myPopup = document.getElementById("popup");
let btnLeft = myPopup.getElementById("btnLeft");
let btnRight = myPopup.getElementById("btnRight");
let alertHeader = document.getElementById("alertHeader");


function showAlert(message) {
  console.log('ALERT BG')
  console.log(message)
    alertHeader.text = message
    myPopup.style.display = "inline";
 
}

btnLeft.onclick = function(evt) {
  console.log("Mute");
  // TODO This needs to mute it for 15 mins
  myPopup.style.display = "none";
  stopVibration()
   showAlertModal = false;
}

btnRight.onclick = function(evt) {
  console.log("Snooze");
  myPopup.style.display = "none";
  stopVibration()
}


// The updater is used to update the screen every 1 SECONDS 
function updateClock() {
  //console.log("Tick");
  
  let nowDate = new Date();
  let hours = nowDate.getHours();
  let mins = nowDate.getMinutes();
  
  //hours = 13;
  
  if (mins < 10) { mins = `0${mins}`; }
  let ampm = hours < 12 ? "AM" : "PM"; 
  
  if (preferences.clockDisplay === "12h"){
    time.text = `${hours%12 ? hours%12 : 12}:${mins} ${ampm}`;
  } else {
    time.text = `${hours}:${mins}`;
  }

  steps.text = (today.local.steps || 0);
    
  // Update mins ago
  if (minsAgo > 0) {
    minsAgoText = Math.round((Date.now()-minsAgo)/60000);
    age.text = `${minsAgoText} mins ago`;
  }
  //console.log(`MINS AGO: ${minsAgoText}`);

  // Update from file if ...
  
  let nowMoment = nowDate.getTime();
  let timeDelta = nowMoment - lastUpdateTime;
  
  if (timeDelta > (1000*5)) {
    readSGVFile('file.txt');
  }
  
}


// Listen for the onopen event - THIS NEVER SEEMS TO FIRE!!
messaging.peerSocket.onopen = function() {
  console.log("Socket Open");
  fetchCompanionData();
}




// Update the clock every tick event
clock.ontick = () => updateClock();
