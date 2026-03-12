DOCUMENTACION ACTUAL

- General: `docs/README.md`
- Modulos individuales: `docs/modules/`

NOTES DE DEVELOPMENT (TEMPORAL)




Funcionalidades q necesito pal sistema login y signup

signup 
login 
logout
cambiar password
recuperar password
acceso al dash
opcion de setting pa cambiar informacion personal like number pass etc
historial de billing
status subscripcion
cancelarla
borrar cuenta
planes
send confirmation email when creating account
en setting hacer que si eres admin no slo cargues los usuarios sinoq puedas ver la info de ese user
hacer readme y requeriments

dashboard tendra otro Nombre
abajo dira powered by Valirik

system to send emails cada q se acerca cancelacion subscripcion
reportes cada ciertas horas

TO-DO
-dashboard data
-formula software
-setting
  - user info
      -update it
      -delete account
  - subscription info
     - cancelarlaa
     - cambiar plan
     - sistemanotificacions de renew dates
  - IF ADMIN
     - load users
         - disable account
         - delete account
  - Cambiar lang
-Cambiar admin level a una seccion nueva instead of tenerla en ajustas


BUGS:

-Setting dont load the admin options when its with that access level   --FIXED
-database dont load subscription data at puschase it                     --FIXED
-el page de checkemail al hacer login en un not verified account no funciona properly no manda email de verification --fixed
- if i cancel the subscription from de dashboard la cancela tambn en el portal stripe perooo si la cancelo desde alla no me actualiza en el dasboard
- en la base de datos me crea email verified y account verified pero solo need 1 --fixed
- no me guarda suibscription id --fixed

-HAY UN BUG q cuando te subscribes se queda en loop el loading de subcsroptoions

NOTE:

paln gratis con dara limitada
separr servidor stripe de servidor cuentas
script que levante ambos servidores/

hace api modular
ejemplo
instead of call directl de api path hacer un function
get
setter

OPCION SORT BY//...
Dropdown timeframe

--
bajar latencia con cantidad rde requst solo en backend y cliebnte osolo llama

src/
    config/
      symbols.js
      timeframes.js
    shared/
      redis.js
      keys.js
      util.js
    api/
      server.js
    ingestor/
      run.js
      liveRunner.js
      histRunner.js
    live/
      tdTimeSeries.js
      liveEngine.js
    history/
      firebaseRtdb.js
      dailiReader.js
      dailyAgg.js
      histCacheService.js

...
.
..

.
TODO
me falta hacer que el dia se guarde en fb y borre el viejoz


NEW TODO


arreglar ganancias-waiting

order rank symbol regime loquisitifoorprint flow pressure(hide) trend acceleration

SCROLL
esconder WT de symbol dahs
y liquiduity
Chart
checkmarts to view
axis falta porcentaje
quitar el cvargando
lightmode - cambiar a bombillita
cambiar tabla a cuadrados como en mobile
colores symbol date en light mode
quitar campo numero
agregar el cookie banner

#legal----------------------------------------------------------------

Debes guardar en tu base de datos:

Timestamp

IP

Versión de los Terms aceptada

En el footer pon:

© 2026 Valarik LLC. All rights reserved.
Terms & Conditions | Privacy Policy | Cookie Notice

Diseño recomendado:

Fondo blanco

Tipografía limpia (Inter, Roboto, Open Sans)

Ancho máximo 800px (centrado)

Márgenes amplios

Índice arriba opcional (para UX)
{
  userId: "abc123",
  termsAccepted: true,
  termsVersion: "2026-03-01",
  privacyVersion: "2026-03-01",
  acceptedAt: "2026-03-02T18:33:21Z",
  acceptedIP: "189.xxx.xxx.xxx"
}

FALTA DE HACER >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

ads IMPORTAT
btn logount on mobile -YA
header estatico en mobile IMPORTANT
backup database IMPORTANT
eraning calculo q diga dias faltantes ya
landingpage -YA
logo nerion 
en mobile quitar emojis_YA

sol y luna ya
sidebar cerrable

header mover txt hora abajo ya

poner clear denotr o search bar ya 
mover filtros al alo de search ya
borrar txt row header ya
eliminar wt de filtros ya
fondo de politicas azul ya
mostrar si acepto o no en admin ya

footer en pantalla click ya
estrechar y estirar por axis ya
y a la derecha ya
problema del back ya
legal ya

cuadras symbol dashboard ya

la tabla menos bold el live borrar ya


terms y privacy nombres y coki y disclimer en header navbar ya

indbox en nerion msnsgweer 
qagregar symbols

quitrar row50ya


poenr flecha cabio de posicion y cuanto tiempo lleva ahi si es neutral si lleav como un rato es -neutral
comentar wt por ahora
update dnetro 

el sidebar cerrao es solo pro
