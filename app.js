var express = require('express');
var sprintf = require('sprintf').sprintf;
var pg = require('pg');

var app = module.exports = express.createServer();

// Configuration
app.configure(function(){
  app.use(express.bodyParser()); 
  app.use(express.methodOverride());
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

app.get('/geojson', function(req, res) {

  function resSend(jsonOutput) {
    // Allowing x-domain request
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
    res.header("Access-Control-Allow-Headers", "Content-Type, Depth, User-Agent, X-File-Size, X-Requested-With, If-Modified-Since, X-File-Name, Cache-Control");
  
    if (callback) {
      if (typeof jsonOutput == 'string' ) {
        res.send(callback + "(" + jsonOutput + ");", {'Content-Type': 'text/javascript'});
      } else {
        res.send(callback + "(" + JSON.stringify(jsonOutput) + ");", {'Content-Type': 'text/javascript'});
      }
    } else {
      res.send(jsonOutput, {'Content-Type': 'application/json'});
    }
  }

  var host = req.param("host", '115.146.90.141');
  var db = req.param("db", 'geo2');
  var port = req.param("port", '5432');

  var user = req.param("user", 'user'); 
  var password = req.param("password", 'password');

  var table = req.param("table", "ste06aaust");
  var featureKey = req.param("key", "state_code");
  var featureGeom = req.param("geom", "view_geom");
  var bbox = req.param("bbox", null);
  var callback = req.param("callback", null);

  // special callback for OpenLayers
  var formatOptions = req.param("format_options", null); 
  if (formatOptions) {
    callback = formatOptions.substr(formatOptions.indexOf(':')+1)    
  }

  var config = {
    user: user,
    password: password,
    host: host,
    database: db,
    port: port
  };

  var whereClause = 'TRUE';
  if (bbox && bbox.length>0) { // filtering by bbox
    var coordinates = bbox.split(",");
    whereClause = sprintf("ST_Intersects(%s,ST_Envelope(ST_GeomFromText('LINESTRING(%s %s, %s %s)',4283)))",
        featureGeom, coordinates[0], coordinates[1], coordinates[2], coordinates[3]);
  }

	pg.connect(config, function(err, client) {
    var sqlCommand = sprintf("SELECT TRIM(TRAILING ' ' FROM %s) AS %s", featureKey, featureKey);
    sqlCommand += sprintf(", ST_AsGeoJSON(1,%s,15,1) AS geom_json ", featureGeom);
    sqlCommand += sprintf("FROM %s WHERE %s", table, whereClause);

	  console.log(sqlCommand);
		var query = client.query(sqlCommand,
			function(error, result) {
				console.log(result);
        if (!result || !("rows" in result)) {
          resSend(callback, { "error": "No result found" });
          return;
        }
        var jsonOutput = '{"type": "FeatureCollection", "crs":{"type":"name","properties":{"name":"EPSG:4283"}}, "features": [';
        for (var i=0; i<result.rows.length; i++) {
          var iFeatureKey = result.rows[i][featureKey];
          var iFeature = '{"type": "Feature", "properties":{"feature_code": "'+iFeatureKey+'"}';
          var geomJson = result.rows[i]["geom_json"]; // this is returned as non-parsed JSON text, keep it that way
          iFeature += ', "geometry": '+geomJson;
          iFeature += ' }';
          jsonOutput += iFeature;
          if (i<result.rows.length-1) {
            jsonOutput += ',';
          }
        }      
        jsonOutput += ']}';
        resSend(jsonOutput);
			}
		);
	});

});

app.listen(2000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

