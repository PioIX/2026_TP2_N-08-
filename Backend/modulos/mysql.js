//Sección MySQL del código
const mySql = require("mysql2/promise");

/**
 * Objeto con la configuración de la base de datos MySQL a utilizar.
 */
const SQL_CONFIGURATION_DATA =
{
	host: process.env.MYSQL_HOST,
	user: process.env.MYSQL_USERNAME,
	password: process.env.MYSQL_PASSWORD, 
	database: process.env.MYSQL_DB,	
	port: 3306,
	charset: 'UTF8_GENERAL_CI'
}

/**
 * Realiza una query a la base de datos MySQL indicada en el archivo "mysql.js".
 * @param {String} queryString Query que se desea realizar. Textual como se utilizaría en el MySQL Workbench.
 * @returns Respuesta de la base de datos. Suele ser un vector de objetos.
 */
exports.realizarQuery = async function (queryString, params = []) {
    let connection;
    try {
        connection = await mySql.createConnection(SQL_CONFIGURATION_DATA);
        const [rows] = await connection.execute(queryString, params);
        return rows;
    } catch (err) {
        console.error("Error en la consulta MySQL:", err.message);
        throw err; // Permite que el catch de index.js devuelva el status 500 con detalle
    } finally {
        if (connection && connection.end) await connection.end();
    }
};