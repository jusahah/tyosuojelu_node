var fs = require('fs');
var pdf = require('html-pdf');
var archiver = require('archiver');
var Promise = require("bluebird");
var Inert = require('inert');
var ncp = require('ncp').ncp; // For copying pdfs

var html = fs.readFileSync('./testibig.html', 'utf8');


var ZIP_LINK_HEAD = 'http://localhost:8077/get/';

var options = { 
	format: 'A4',
	"footer": {
	    "height": "18mm",
	    "contents": '<span style="color: #444;">Tyoturvallisuussuunnitelma.fi | {{page}}</span>/<span>{{pages}}</span>'
	  }, 

}; // PDF options
var _ = require('lodash');
var AdmZip = require('adm-zip');

const Hapi = require('hapi');


// We read the template head part right away to memory so don't need to read it later all the time
// Plus now we can safely read it sync as we are setting up the app anyway (no point optimizing here)
var headTemplate = fs.readFileSync('./head_template.html', "utf8");
var footerTemplate = '</body></html>';

// Create a server with a host and port
const server = new Hapi.Server();
server.register(Inert, function() {});
server.connection({ 
    host: 'localhost', 
    port: 8077,
    routes: { cors: true } 
});

// Add the route
server.route({
    method: 'POST',
    path:'/', 
    handler: function (request, reply) {

    	var email = request.payload.email;
    	var htmls  = JSON.parse(request.payload.htmls); 

    	console.log(htmls.length);

    
    	var folderName = 'files_' + Math.round(Math.random()*10000000000);
    	var readyToZip = createFromHTMLs(email, htmls, folderName);
    		
    		
	    readyToZip.then(function() {
	    	createZip(folderName);
	    	setTimeout(function() {
	    		return reply({link: ZIP_LINK_HEAD + folderName});
	    	}, 500);
	    	
	    }).catch(function(err) {
	    	return reply({reason: err}).code(500);
	    });
	    		
    

    	console.log(htmls.length);
    	// Let user get his reply immediately
        
    }
});
server.route({
    method: 'GET',
    path:'/get/{zipname}', 
    handler: function (request, reply) {

    	var zipName = request.params.zipname;
    	reply.file('./zips/' + zipName + '.zip');  
    }
});

server.start(function(err) {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});

function copyStaticPDFs(folderName) {
	return new Promise(function(resolve, reject) {
		var source = './staticpdfs';
		var destination = './tempfiles/' + folderName;
		ncp(source, destination, function (err) {
		 if (err) {
		   return reject(err);
		 }
		 return resolve();
		});
	});
}



function createFromHTMLs(email, htmls, folderName) {
	
	fs.mkdirSync('./tempfiles/' + folderName); // This is sync for simplicity, perhaps change later

	var proms = _.map(htmls, function(htmlObj) {
		console.log(htmlObj.name);
		return createPDF(folderName, htmlObj.name, htmlObj.html);
	});

	var copyProm = copyStaticPDFs(folderName);

	proms.push(copyProm);

	console.log("PROMS: " + proms.length);
	var readyToZip = Promise.all(proms);

	return readyToZip;
	
}

function createPDF(folderName, documentName, html) {
	return new Promise(function(resolve, reject) {
		console.log("Starting to create:" + documentName);
		var totalHTML = headTemplate + html + footerTemplate; // Very simple string concat
		pdf.create(totalHTML, {
			format: 'A4',
			"header": {
			    "height": "18mm",
			    "contents": '<span style="color: #656565; font-size: 8px; font-style: italic; float: right;">Nollaversio IT - Työturvallisuussuunnitelma (www.tyoturvallisuussuunnitelma.fi)</span>'
			  }, 		
			"footer": {
			    "height": "18mm",
			    "contents": '<span style="color: #656565; font-size: 8px; font-style: italic; float: right;">' + documentName + ' | {{page}}/{{pages}}</span>'
			  }, 	

		}).toFile('./tempfiles/' + folderName + '/' + documentName + '.pdf', function(err, res) {
		  if (err) {
		  	console.log(err);
		  	return reject(err);
		  }
		  return resolve();
		});			
	});

}

function informUser(folderName, email) {
	// Send email here
	console.log("EMAIL TO: " + email);
}

function informUserOfError(email, err) {
	console.log("ERROR EMAIL TO: " + email);
	console.log(err);
}

function createZip(folderName) {

	var output = fs.createWriteStream('./zips/' + folderName + '.zip');
	output.on('close', function() {
        console.log('done zipping!');
    });
	var archive = archiver('zip');
	archive.pipe(output);
	archive.on('error', function(err) {
        throw err;
    });
	archive.directory('./tempfiles/' + folderName, 'files');
	archive.finalize();
	
	console.log("WRITTEN TO ZIP: " + './zips/' + folderName + '.zip');
}
/*
console.log("Starting to create");
pdf.create(html, options).toFile('./businesscard.pdf', function(err, res) {
  if (err) return console.log(err);
  console.log(res); // { filename: '/app/businesscard.pdf' }
});
*/