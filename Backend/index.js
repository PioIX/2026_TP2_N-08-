var express = require('express'); 
var bodyParser = require('body-parser'); 
var cors = require('cors');
const { realizarQuery } = require('./modulos/mysql');

var app = express(); 
var port = process.env.PORT || 4000; 

app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use(cors());

app.listen(port, function(){
    console.log(`Server running in http://localhost:${port}`);
});

app.get('/', function(req, res){
    res.status(200).send({
        message: 'GET Home route working fine!'
    });
});
