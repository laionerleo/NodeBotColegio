const { Client, Location, Poll, List, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const mysql = require('mysql2/promise');

const PDFDocument = require('pdfkit');
const fs = require('fs');

// Configuración de la conexión a MySQL
const dbConfig = {
    host: '127.0.0.1', // Reemplaza con tu host
    user: 'root', // Reemplaza con tu usuario
    password: '', // Reemplaza con tu contraseña
    database: 'basebotrestaurante' // Reemplaza con tu base de datos
};

async function conectarBaseDeDatos() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',  // Cambia esto por tu host
            user: 'root', // Cambia esto por tu usuario
            password: '', // Cambia esto por tu contraseña
            database: 'basebotrestaurante'
        });

        console.log('Conexión a la base de datos exitosa');
        return connection;
    } catch (error) {
        console.error('Error al conectar con la base de datos:', error);
        process.exit(1); // Termina el programa si no se puede conectar
    }
}

// Llamar a la función para conectar a la base de datos al iniciar el programa
const connection =  conectarBaseDeDatos();


// Función para ejecutar consultas a la base de datos
async function ejecutarConsulta(query) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows, fields] = await connection.execute(query);
        return rows;
    } catch (error) {
        console.error('Error ejecutando la consulta:', error);
        return null;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: false,
    }
});

client.initialize();

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

let pairingCodeRequested = false;
client.on('qr', async (qr) => {
    console.log('QR RECEIVED', qr);

    const pairingCodeEnabled = false;
    if (pairingCodeEnabled && !pairingCodeRequested) {
        const pairingCode = await client.requestPairingCode('96170100100');
        console.log('Pairing code enabled, code: '+ pairingCode);
        pairingCodeRequested = true;
    }
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('ready', async () => {
    console.log('READY');
    const debugWWebVersion = await client.getWWebVersion();
    console.log(`WWebVersion = ${debugWWebVersion}`);
});

client.on('message', async msg => {
    console.log('MESSAGE RECEIVED', msg);
    //console.log('DATA ', msg._data);

    const telefono = msg.from.split('@')[0]; // Esto obtiene el número sin el '@c.us'
    const lcMensajeEntrante =  msg.body;
    const lcNombreCliente =  msg._data.notifyName;
    console.log("nombre",lcNombreCliente );

    //console.log('Teléfono:', telefono);
       const paso = await obtenerPasoPorTelefono(telefono, lcNombreCliente);
        
        if (paso !== null) {
//            client.sendMessage(msg.from, `El cliente con teléfono ${telefono} está en el paso ${paso}.`);

            // Aquí se maneja el switch según el paso en el que se encuentra el cliente
            switch (paso) {
                case 1:
                    // Enviar un saludo cordial
                    //await client.sendMessage(msg.from, '¡Saludos cordiales! Esperamos que tengas un excelente día.');
                    await client.sendMessage(msg.from, '¡Hola, Kjaras el Chuletón te presenta el siguiente menú que deseas degustar el día de hoy:\n' );
                    

                    let  mensajemenu=await obtenerMenu();
                    await client.sendMessage(msg.from, mensajemenu);

                    // Instrucciones para realizar el pedido
                    await client.sendMessage(msg.from, 'Para realizar tu pedido, sigue estos pasos:\n' +
                        'Envía una lista de números, donde cada número representa un plato. Cada número se repite según la cantidad deseada de ese plato.\n' +
                        'Por ejemplo, si deseas pedir:\n' +
                        '- 3 Kjaras\n' +
                        '- 1 Costillas\n' +
                        '- 2 Cervezas\n' +
                        'Envíanos el siguiente mensaje:\n' +
                        '`1, 1, 1, 3, 4, 4`\n' +
                        'Recuerda: Si necesitas ajustar tu pedido o tienes alguna pregunta, no dudes en contactarnos.\n' +
                        '¡Estamos ansiosos por atenderte! 🎉'
                    );


                    
                    // Actualizar al paso 2
                    const actualizado = await actualizarPasoPorTelefono(telefono, 2);
                    if (actualizado) {
                        //client.sendMessage(msg.from, 'Tu proceso ha sido actualizado al paso 2.');
                    } else {
                        //client.sendMessage(msg.from, 'Hubo un error al intentar actualizar al paso 2.');
                    }
                    
                    break;
                case 2:

                            const listaPedidos = lcMensajeEntrante.trim();
                            console.log("listaPedidosEntrante", listaPedidos);
                            
                            // Verificar formato y estructura
                            if (!/^\d+(,\d+)*$/.test(listaPedidos)) {
                                await client.sendMessage(msg.from, 'El formato del pedido es incorrecto. Debe ser una lista de números separados por comas, como: 1,1,2,3.');
                                return;
                            }
                            
                            // Convertir la lista a un array de números
                            const pedidos = listaPedidos.split(',').map(Number);
                            
                            // Obtener el menú con precios
                            const menu = await obtenerMenuConPrecios();
                            console.log("menu con precios", menu);
                            
                            // Calcular el monto total
                            let total = 0;
                            const pedidoEstructurado = {};
                            
                            pedidos.forEach(pedido => {
                                if (menu[pedido]) {
                                    total += parseFloat(menu[pedido].precio);
                                    //const precio = parseFloat(menu[pedido].precio);
                                    pedidoEstructurado[pedido] = (pedidoEstructurado[pedido] || 0) + 1;
                                }
                            });
                            
                            // Construir el mensaje de confirmación del pedido
                            let mensajeConfirmacion = 'Tu pedido ha sido recibido. Detalles:\n';
                            for (const [plato, cantidad] of Object.entries(pedidoEstructurado)) {
                                const nombrePlato = menu[plato]?.nombre || 'Desconocido';
                                mensajeConfirmacion += `- ${nombrePlato}: ${cantidad} unidad(es)\n`;
                            }

                            console.log("pedido estrcyurado", pedidoEstructurado);
                            mensajeConfirmacion += `Monto total: ${total} bs`; // Aseguramos que el total se muestra con dos decimales
                            

                           
                            const idPedido = await  insertarPedido(telefono, total) ;
                            const insertarpedidodetalle = await  insertarDetallesPedido(idPedido, pedidoEstructurado)
                            // Enviar mensaje de confirmación
                            await client.sendMessage(msg.from, mensajeConfirmacion);
                            const opcionesTexto = `1. ✅ Confirmar pedido \n 2. 🔄 Volver a hacer el pedido \n Solo responde con el número de la opción que prefieras.`;
                                    await client.sendMessage(msg.from, opcionesTexto);

                            
                            
                            // Actualizar el paso del cliente
                            await actualizarPasoPorTelefono(telefono, 3);
                

                    client.sendMessage(msg.from, 'Acción para el paso 2.');
                    break;
                    case 3:
                        // Obtener la respuesta del usuario
                        const respuesta =lcMensajeEntrante.trim(); // Obtener la respuesta y eliminar espacios
                    
                        if (respuesta === '1') {
                            // Opción 1: Confirmar el pedido
                            await client.sendMessage(msg.from, '¡Tu pedido está casi listo! 🥳 Te confirmaremos en breve.');
                                  // Ruta de la imagen que quieres enviar
                            const imagenPath = 'qrcobro.jpeg';
                            const media = MessageMedia.fromFilePath(imagenPath);
                            const clienteId = await obtenerClientePorTelefono(telefono);
                            const pedidoid =await obtenerCodigoPedidoPorTelefono(clienteId);

                            await enviarReciboPDF(client,  msg.from, pedidoid, pedidoid);
                            
                            let precioqr =await obtenerMontoPedidoPorTelefono(clienteId) ;
                            // Enviar la imagen junto con un mensaje adicional
                            await client.sendMessage(msg.from, media);
                            await client.sendMessage(msg.from, 'Este es el monto que debes pagar:'+precioqr+" Bs ");
                            
                        //    await enviarReciboPDF(client, msg.from, `recibo_${clienteId}`);


                    
                            // Actualizar al paso 3 (o el estado correspondiente para finalizar el proceso)
                            await actualizarPasoPorTelefono(telefono, 1);
                        } else if (respuesta === '2') {
                            // Opción 2: Volver al paso 2
                            await client.sendMessage(msg.from, 'Vamos a volver a la selección de tu pedido. Por favor, envía tu pedido nuevamente.');
                             // Obtener el código del pedido para anularlo
                             const clienteId = await obtenerClientePorTelefono(telefono);
                            const Pedidoid = await obtenerCodigoPedidoPorTelefono(clienteId);

                            if (Pedidoid) {
                                // Anular el pedido
                                await anularPedidoPorPedido(Pedidoid);
                                console.log('Pedido anulado con el código:', Pedidoid);
                            } else {
                                console.log('No se encontró un pedido para anular.');
                            }
                            
                    
                            // Actualizar al paso 2 para permitir al usuario rehacer el pedido
                            await actualizarPasoPorTelefono(telefono, 2);
                        } else {
                            // Respuesta no válida
                            await client.sendMessage(msg.from, 'Respuesta no válida. Por favor, responde con 1 para confirmar o 2 para rehacer tu pedido.');
                        }
                        break;
                    
                case 4:
                    client.sendMessage(msg.from, 'Acción para el paso 4.');
                    break;
                case 5:
                    client.sendMessage(msg.from, 'Acción para el paso 5.');
                    break;
                case 6:
                    client.sendMessage(msg.from, 'Acción para el paso 6.');
                    break;
                case 7:
                    client.sendMessage(msg.from, 'Acción para el paso 7.');
                    break;
                case 8:
                    client.sendMessage(msg.from, 'Acción para el paso 8.');
                    break;
                case 9:
                    client.sendMessage(msg.from, 'Acción para el paso 9.');
                    break;
                case 10:
                    client.sendMessage(msg.from, 'Acción para el paso 10.');
                    break;
                default:
                    client.sendMessage(msg.from, 'El paso no está definido en el sistema.');
                    break;
            }
        } else {
            client.sendMessage(msg.from, 'No se encontró el cliente o hubo un error en la consulta.');
        }

   
    // Aquí continúa el resto de tu código existente...
});


// Función para consultar el paso de un cliente
async function obtenerPasoPorTelefono(telefono, nombre) {
    const query = 'SELECT Paso FROM cliente WHERE Telefono ='+telefono;
    const resultado = await ejecutarConsulta(query);
    if (resultado && resultado.length > 0) {
        return resultado[0].Paso;
    } else {
        await insertarCliente(nombre, telefono);
        return 1; // O el paso inicial que desees asignar
 
    }
}

// Función para actualizar el paso de un cliente
async function actualizarPasoPorTelefono(telefono, nuevoPaso) {
    const query = 'UPDATE cliente SET Paso ='+ nuevoPaso+'  WHERE Telefono = '+telefono;
    const resultado = await ejecutarConsulta(query);
    if (resultado && resultado.affectedRows > 0) {
        console.log('Paso actualizado correctamente.');
        return true;
    } else {
        console.log('No se pudo actualizar el paso.');
        return false;
    }
}

async function obtenerMenu() {
    const query = 'SELECT Nombre, Precio FROM comida WHERE Estado = 2'; // Consulta para obtener las comidas disponibles
    let menu = '';
    
    try {
        const results = await ejecutarConsulta(query);
        console.log("resultado comida " , results );
        if (results.length > 0) {
            results.forEach((comida, index) => {
                menu += `${index + 1}. ${comida.Nombre} (${comida.Precio} bs)\n`;
            });
        } else {
            menu = 'No hay comidas disponibles en este momento.';
        }
    } catch (error) {
        console.error('Error al obtener el menú:', error);
        menu = menu+'Hubo un error al intentar obtener el menú.';
    }

    return menu;
}


async function obtenerMenuConPrecios() {
    const query = 'SELECT Nombre, Precio FROM comida WHERE Estado = 2'; // Consulta para obtener las comidas disponibles
    let menu = {};
    
    try {
        const results = await ejecutarConsulta(query);
        console.log("resultado comida ", results);
        if (results.length > 0) {
            results.forEach((comida, index) => {
                // Guardamos el índice 1 basado en el índice de la base de datos
                menu[index + 1] = {
                    nombre: comida.Nombre,
                    precio: comida.Precio
                };
            });
        } else {
            console.log('No hay comidas disponibles en este momento.');
        }
    } catch (error) {
        console.error('Error al obtener el menú con precios:', error);
        // En caso de error, podrías devolver un objeto vacío o manejarlo según sea necesario
    }

    return menu;
}


// Función para insertar un nuevo cliente en la base de datos
async function insertarCliente(nombre, telefono) {
    const query = `
        INSERT INTO cliente ( Nombre, Telefono, FechaRegistro, HoraRegistro, Estado, Paso)
        VALUES ( '${nombre}', ${telefono}, CURDATE(), CURTIME(), 1, 1)
    `;

    try {
        await ejecutarConsulta(query);
        console.log('Cliente insertado correctamente.');
    } catch (error) {
        console.error('Error al insertar el cliente:', error);
    }
}

// Función para obtener el ID del cliente basado en el teléfono
async function obtenerClientePorTelefono(telefono) {
    const query = 'SELECT Cliente FROM cliente WHERE Telefono ='+telefono;
    const resultado = await ejecutarConsulta(query);
    if (resultado && resultado.length > 0) {
        return resultado[0].Cliente;
    } else {
        console.log('No se encontró el cliente con el teléfono proporcionado.');
        return null;
    }
}


// Función para insertar un nuevo pedido
async function insertarPedido(telefono, montoTotal) {
    // Obtener el ID del cliente
    const clienteId = await obtenerClientePorTelefono(telefono);
    if (!clienteId) {
        console.log('No se pudo obtener el cliente. No se puede realizar el pedido.');
        return;
    }

    // Generar el código del pedido
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    const hora = String(fecha.getHours()).padStart(2, '0');
    const minuto = String(fecha.getMinutes()).padStart(2, '0');
    const segundo = String(fecha.getSeconds()).padStart(2, '0');
    const codigoPedido = `${anio}${mes}${dia}-${hora}${minuto}${segundo}`;

    // Insertar el pedido en la base de datos
    const query = `
        INSERT INTO pedido ( Cliente, CodigoPedido, MontoTotal, FechaPedido, HoraPedido, EstadoPedido)
        VALUES ( ${clienteId}, '${codigoPedido}', ${montoTotal}, CURDATE(), CURTIME(), 1)
    `;    
    try {
        await ejecutarConsulta(query);
           // Obtener el ID del último pedido insertado
                // Buscar el ID del pedido basado en el código del pedido
        const queryFindId = "SELECT Pedido FROM pedido WHERE CodigoPedido = '"+codigoPedido+"'" ;


           const [rows] = await ejecutarConsulta(queryFindId);
           console.log(rows);
           const idPedido = rows.Pedido;
           console.log('Pedido insertado correctamente. ID del pedido:', idPedido);
           return idPedido;
        console.log('Pedido insertado correctamente.');
    } catch (error) {
        console.error('Error al insertar el pedido:', error);
    }
    return 0;
}





// Función para insertar detalles del pedido
async function insertarDetallesPedido(idPedido, pedidoEstructurado) {
    const queries = [];
    const valores = [];

    let detalleserial=1;
    for (const [idComida, cantidad] of Object.entries(pedidoEstructurado)) {
        const precio = await obtenerPrecioPlato(idComida);
        if (precio !== null) {
            const subtotal = precio * cantidad;
            queries.push(`
                INSERT INTO pedidodetalle (Pedido, Detalle, Comida, Precio, Cantidad, Descuento, Subtotal, Estado)
                VALUES (${idPedido}, ${detalleserial}, ${idComida}, ${precio}, ${cantidad}, 0, ${subtotal}, 1)
            `);
            detalleserial=detalleserial +1;
            valores.push([idPedido, idComida, idComida, precio, cantidad, 0, subtotal, 1]);

        }
    }
    //console.log("valores", valores);
    console.log("queries", queries);

    for (let i = 0; i < queries.length; i++) {
        await  ejecutarConsulta(queries[i]);
    }


  
}


// Función para obtener el precio de un plato por su ID
async function obtenerPrecioPlato(idComida) {
    const query = 'SELECT Precio FROM comida WHERE Comida = '+idComida ;
    const resultados = await ejecutarConsulta(query);

    if (resultados.length > 0) {
        return resultados[0].Precio;
    } else {
        console.log(`No se encontró el plato con ID ${idComida}.`);
        return null;
    }
}

async function obtenerCodigoPedidoPorTelefono(idcliente) {
    const query = " SELECT Pedido FROM pedido     WHERE Cliente ="+idcliente+"      AND EstadoPedido = 1  ORDER BY FechaPedido DESC, HoraPedido DESC   LIMIT 1 ";
    console.log("traer los pedidos del telfono ", query);
    const [rows] = await ejecutarConsulta(query);


    console.log("respuest traer los pedidos del telfono ", rows);
      return rows.Pedido;
}

// Función para anular un pedido por su código
async function anularPedidoPorPedido(idpedido) {
    const query = `
        UPDATE pedido
        SET EstadoPedido = 4
        WHERE Pedido = `+idpedido;
    await ejecutarConsulta(query);
}
async function obtenerMontoPedidoPorTelefono(idcliente) {
    const query = `
        SELECT MontoTotal
        FROM pedido
        WHERE Cliente = ${idcliente}
        AND EstadoPedido = 1
        ORDER BY FechaPedido DESC, HoraPedido DESC
        LIMIT 1
    `;
    console.log("Consulta para obtener el pedido y monto total:", query);
    const [rows] = await ejecutarConsulta(query);
    console.log("Pedido y monto total obtenidos:", rows);
    console.log("Pedido y monto total obtenidos:", rows.MontoTotal);
    //console.log("Pedido y monto total obtenidos:", rows[0]);
    return parseFloat(rows.MontoTotal); // Retornamos el objeto completo con Pedido y MontoTotal
    
}

/*

async function generarPDFRecibo(nombreArchivo) {
    const doc = new PDFDocument();
    const rutaArchivo = `${nombreArchivo}.pdf`;

    // Crear el PDF y escribirlo en el sistema de archivos
    doc.pipe(fs.createWriteStream(rutaArchivo));

    // Añadir contenido al PDF (opcional)
    doc.text('Recibo de compra', {
        align: 'center'
    });

    // Finalizar y guardar el PDF
    doc.end();

    return rutaArchivo;
}
*/

async function enviarReciboPDF(client, telefono, nombreArchivo, pedidoid) {
    // Generar el PDF
    
    //console.log("pedido id patra obtenr datos recibo ",pedidoid);
    let datospedido=await obtenerDatosPedido(pedidoid) ;
    //console.log("datos pedido para generar recibo",datospedido);
    const pdfPath = await generarPDFRecibo(nombreArchivo,datospedido );
    console.log("rutapdf",  pdfPath);
    // Leer el archivo PDF
    const media = MessageMedia.fromFilePath(pdfPath);

    // Enviar el PDF al cliente
    await client.sendMessage(telefono, media);
    console.log(`Recibo PDF enviado a ${telefono}`);
}


async function generarPDFRecibo(nombreArchivo, datosPedido) {
    const doc = new PDFDocument({ size: [300, 400], margin: 10 });
    const rutaArchivo = "Recibo-"+nombreArchivo+".pdf";

    // Crear el PDF y escribirlo en el sistema de archivos
    doc.pipe(fs.createWriteStream(rutaArchivo));

    // Título del recibo
    doc.fontSize(14).text('Recibo de compra', { align: 'center' });
    doc.moveDown();

    // Información del pedido
    doc.fontSize(10).text(`Fecha: ${datosPedido.pedido.FechaPedido}`, { align: 'left' });
    doc.text(`Hora: ${datosPedido.pedido.HoraPedido}`, { align: 'left' });
    doc.text(`Código: ${datosPedido.pedido.CodigoPedido}`, { align: 'left' });
    doc.moveDown();

    // Detalles del pedido
    doc.text('Detalle de la compra:', { align: 'left' });
    doc.moveDown();
    /*
    datosPedido.detalles.forEach(detalle => {
        doc.text(`Comida: ${detalle.Comida}`);
        doc.text(`Precio: $${detalle.Precio}`);
        doc.text(`Cantidad: ${detalle.Cantidad}`);
        doc.text(`Subtotal: $${detalle.Subtotal}`);
        doc.moveDown();
    });
    */

    // Monto total
    doc.moveDown();
    doc.fontSize(12).text(`Monto Total: $${datosPedido.pedido.MontoTotal}`, { align: 'right' });
    
    // Finalizar y guardar el PDF
    doc.end();

    return rutaArchivo;
}


async function obtenerDatosPedido(pedidoId) {
    const queryPedido = `
        SELECT Pedido, CodigoPedido, MontoTotal, FechaPedido, HoraPedido
        FROM pedido
        WHERE Pedido = ${pedidoId}
    `;
    
    const queryDetalles = `
        SELECT Comida, Precio, Cantidad, Descuento, Subtotal
        FROM pedidodetalle
        WHERE Pedido = ${pedidoId}
    `;
    
    const [pedidoRows] = await ejecutarConsulta(queryPedido);
    const [detalleRows] = await ejecutarConsulta(queryDetalles);
    console.log("pedido rows ", pedidoRows);

      return {
            pedido: pedidoRows,
            detalles: detalleRows
        };
    
}

