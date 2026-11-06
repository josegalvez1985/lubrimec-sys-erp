# Guía: backup por correo en otro proyecto

Cómo llevar el backup de **Lubrimesys** (06/11/2026) a otro proyecto y otra base de datos. Genera todos
los días una copia del esquema en scripts SQL comprimidos (estructura, aplicación, endpoints y datos)
y la manda por correo. **El código completo va al final, en el anexo A**: esta guía es lo único que
hay que llevar al otro proyecto.

> **Estado al 06/11/2026: todavía no está probado de punta a punta.** La primera versión corrió en
> `oracleapex.com` y se cortó por el límite de CPU (ver sección 10). La versión del anexo, partida en
> tramos para evitar ese límite, todavía no se había compilado ni corrido en Oracle. Tampoco están
> probados el envío de adjuntos, la exportación de APEX y ORDS ni una restauración. Hacer las pruebas
> de las secciones 5 y 6 antes de confiar en la copia.

**Funciona tal cual en:** Oracle con APEX. Sin APEX o con otro motor hay que cambiar partes o usar otra
herramienta: ver sección 9.

## 0. Cómo funciona

```
JOB_BACKUP_PROY (todos los días, de madrugada)
   │
   ▼
ejecutar ─ anota la corrida en PROY_BACKUP_LOG
   │       arma la lista de lo que hay que copiar en PROY_BACKUP_TAREA
   ▼
tramo ──── hace tareas hasta usar el 60 % de CPU_PER_CALL
   │       cierra la parte: .sql → .zip → correo (APEX_MAIL)
   ▼
¿Faltan tareas?
   ├─ sí → crea un job BACKUP_TRAMO_* → continuar(id) → otro tramo
   └─ no → registra OK o CON ERRORES → correo de resumen
```

- **Partes numeradas, en orden de restauración:** `estructura`, `apex_ords` y `datos`.
- **El resumen es la señal:** si no llegó, la corrida no terminó. Si dice `CON ERRORES`, la copia no
  está completa.
- **Por qué en tramos:** una instancia puede limitar la CPU por llamada y un job entero cuenta como una
  sola llamada.

## 1. Antes de empezar

Ejecutar en SQL Commands de la base del otro proyecto, como dueño del esquema:

```sql
-- Hacen falta CREATE TABLE, CREATE PROCEDURE y CREATE JOB
SELECT privilege FROM session_privs
 WHERE privilege IN ('CREATE TABLE', 'CREATE PROCEDURE', 'CREATE JOB');

-- El límite de CPU, en centésimas de segundo (120000 = 20 minutos)
SELECT resource_name, "LIMIT" FROM user_resource_limits
 WHERE resource_name IN ('CPU_PER_CALL', 'CPU_PER_SESSION', 'LOGICAL_READS_PER_CALL');

-- Cuánto ocupa el esquema
SELECT ROUND(SUM(bytes) / 1048576) AS mb FROM user_segments;
```

- **`CPU_PER_CALL`:** si es un número, cada tramo usa el 60 %. Si dice `UNLIMITED` o `DEFAULT`, usa 5
  minutos de CPU. Si fuera necesario, se fija a mano con `CPU_SEG`.
- **`CPU_PER_SESSION` o `LOGICAL_READS_PER_CALL` con número:** este script no los controla. Si cortan
  la corrida, hay que bajar `CPU_SEG` o revisarlo.
- **Casilla:** usar una solo del dueño, con verificación en dos pasos. Los adjuntos van **sin cifrar**,
  con todos los datos del negocio.

## 2. Decidir qué no se copia

Es lo más importante de adaptar, porque cambia de un proyecto a otro.

| Qué | Dónde se ajusta | Por defecto |
|---|---|---|
| Tablas con la estructura, pero sin los datos | `c_sin_datos` | Solo las de control del backup (`PROY_BACKUP_*`) |
| Columnas que van vacías | `c_col_secreta` | Nombre con `PASSWORD`, `PASSWD`, `API_KEY`, `APIKEY`, `TOKEN` o `SECRET` |
| Imágenes y archivos (BLOB) | Fijo en `datos_tabla` | **No se copian nunca** |

- **Agregar a `c_sin_datos` las tablas con claves, sesiones o registros de API.** Por ejemplo:
  `'^(PROY_BACKUP_|PROY_SESION|IA_)'`. La constante mide 60 caracteres: agrandarla si hace falta.
- **Una clave en una columna con otro nombre viaja por correo.** Revisarlo con:
  ```sql
  SELECT table_name, column_name FROM user_tab_cols
   WHERE REGEXP_LIKE(column_name, 'CLAVE|PASS|KEY|TOKEN|SECRET|CREDENCIAL', 'i')
   ORDER BY 1, 2;
  ```
- **Una clave escrita en el código de un paquete también viaja**, porque la estructura copia el código
  fuente. Moverla a una tabla excluida.
- **Revisar los BLOB antes de instalar.** En Lubrimesys las imágenes se pueden volver a cargar. Si en el
  otro proyecto hay archivos que solo existen en la base, como comprobantes o contratos, **esta copia no
  los protege** y necesitan otra solución:
  ```sql
  SELECT table_name, column_name FROM user_tab_cols WHERE data_type = 'BLOB' ORDER BY 1, 2;
  ```

## 3. Adaptar el anexo A

Copiarlo a `backend/backup.sql` y reemplazar, respetando mayúsculas y minúsculas:

| Marcador o valor | Reemplazar por | Ejemplo |
|---|---|---|
| `PROY` | El nombre del proyecto en mayúsculas | `ACME` |
| `proy` | El nombre del proyecto en minúsculas | `acme` |
| `MI_WORKSPACE_APEX` | El workspace de APEX | `acme` |
| `MI_APP_ID` | El número de la aplicación APEX | `100` |
| `c_desfase` (`-3 / 24`) | La diferencia con UTC, para las horas del registro | `-5 / 24` |
| `-03:00` (dos veces, en el job) | La zona horaria del job | `-05:00` |
| `BYHOUR=3` y `03:00:00` | La hora de menos movimiento | `BYHOUR=2` y `02:00:00` |

Si el país cambia de hora en verano, el desfase fijo corre una hora: usar el nombre de la zona, como
`America/Bogota`, en `start_date`.

Comprobar que no quedó ningún marcador. **`MI_APP_ID` sin reemplazar corta la copia.**

## 4. Instalar

1. Ejecutar `backend/backup.sql` **completo** en SQL Workshop → SQL Scripts. Se puede volver a ejecutar.
2. Revisar que no haya objetos con errores:
   ```sql
   SELECT object_name, object_type, status FROM user_objects
    WHERE object_name LIKE '%BACKUP_PROY%' OR object_name LIKE 'PROY_BACKUP%';
   ```
3. Cargar la casilla. **No escribirla en el archivo, porque se sube al repositorio:**
   ```sql
   BEGIN PKG_BACKUP_PROY.fijar_destino('la casilla'); END;
   ```

El script ya crea el job de la madrugada. Hay que terminar las pruebas de la sección 5 antes de esa hora
o dejar el job apagado mientras tanto:

```sql
BEGIN DBMS_SCHEDULER.DISABLE('JOB_BACKUP_PROY'); END;
-- y al terminar las pruebas:
BEGIN DBMS_SCHEDULER.ENABLE('JOB_BACKUP_PROY'); END;
```

Volver a ejecutar el script crea el job de nuevo y lo deja encendido.

## 5. Probar la corrida

Hacerlo en este orden.

```sql
-- 1. ¿Llega un correo con adjunto? Tiene que traer prueba.zip
BEGIN PKG_BACKUP_PROY.probar_correo; END;

-- 2. ¿Termina? Genera todo y no manda nada: mide cuánto tarda y pesa, y no deja archivos
BEGIN PKG_BACKUP_PROY.lanzar(p_enviar => FALSE); END;

-- 3. Ver el avance. PASO_EN tiene que seguir cambiando
SELECT estado, paso, paso_en, partes, tablas, filas, errores, bytes_zip, detalle
  FROM proy_backup_log ORDER BY id DESC;

-- 4. Recién con lo anterior bien, una copia real con sus correos
BEGIN PKG_BACKUP_PROY.lanzar; END;
```

Si el correo no llega:

```sql
SELECT id, mail_subj, mail_send_count, mail_send_error FROM apex_mail_queue;
SELECT * FROM apex_mail_log;
```

## 6. Comprobar la copia

Solo el último nivel prueba que sirve. Hacer la prueba sin nadie cargando datos: las tablas no se leen
todas en el mismo instante.

**Nivel 1: terminó bien.** `estado = OK` y `errores = 0` en `proy_backup_log`.

**Nivel 2: llegó completa.**

1. Tienen que llegar el resumen y tantas partes como diga `partes`, con los números seguidos. Abrir cada
   `.zip`.
2. Este total tiene que ser igual a `filas`. Si hay más tablas en `c_sin_datos`, ajustar el filtro:
   ```sql
   SELECT SUM(TO_NUMBER(EXTRACTVALUE(XMLTYPE(DBMS_XMLGEN.GETXML(
            'SELECT COUNT(*) c FROM "' || table_name || '"')), '/ROWSET/ROW/C'))) AS filas
     FROM user_tables
    WHERE temporary = 'N' AND table_name NOT LIKE '%$%'
      AND NOT REGEXP_LIKE(table_name, '^PROY_BACKUP_');
   ```
3. Con todo descomprimido en una carpeta, en PowerShell:
   ```powershell
   # Tiene que dar lo mismo que "filas"
   (Select-String -Path *_datos.sql -Pattern '^INSERT INTO').Count
   # No tiene que mostrar nada
   Select-String -Path *.sql -Pattern '^-- (ERROR en|NO SE PUDO)'
   ```

**Nivel 3: se puede restaurar.** Seguir la sección 7 en una base aparte, **nunca en producción**, y
comparar las dos bases con la consulta de filas de arriba y con esta:

```sql
SELECT object_type, status, COUNT(*) FROM user_objects
 WHERE generated = 'N' AND object_name NOT LIKE '%$%'
   AND object_name NOT LIKE 'BACKUP_MANUAL%' AND object_name NOT LIKE 'BACKUP_TRAMO%'
 GROUP BY object_type, status ORDER BY 1, 2;
```

Oracle Database Free en una PC alcanza para probar tablas, datos y paquetes. Para probar también la
aplicación y los endpoints hace falta una base con APEX y ORDS.

## 7. Restaurar

1. Crear el esquema en una base con APEX y ORDS, o sin ellos si solo interesan los datos.
2. Descomprimir los `.zip` de **un mismo día** y correr los `.sql` en orden de número, con SQLcl o
   SQL*Plus. Guardar la salida, porque los scripts siguen aunque haya errores:
   ```sql
   SPOOL restauracion.log
   @proy_2026-11-07_01_estructura.sql
   -- ...y las demás partes, en orden
   SPOOL OFF
   ```
3. Buscar `ORA-` en `restauracion.log`. La primera parte de `datos` apaga FK y triggers, y la última los
   vuelve a prender y ajusta los identity.
4. Importar a mano lo que el resumen haya avisado que no se pudo exportar.
5. Volver a cargar lo que no viaja: las tablas de `c_sin_datos`, las columnas secretas, los BLOB, las
   contraseñas de APEX, los GRANT, los database links y los permisos de red.

## 8. Operación

**Configuración**, en `PROY_BACKUP_CONFIG`, con `UPDATE` + `COMMIT` y sin ejecutar el script:

| Clave | Qué es |
|---|---|
| `DESTINO` | La casilla (con `fijar_destino`) |
| `REMITENTE` | El "De:" del correo; por defecto, el mismo destino |
| `PARTE_MB` | Tamaño de cada `.sql` antes de comprimir (30). Bajarlo si rechazan los adjuntos |
| `APP_ID` | La aplicación APEX a exportar |
| `CPU_SEG` | Opcional: segundos de CPU por tramo. Sin esto, el 60 % de `CPU_PER_CALL` |

**Si queda `EN CURSO` mucho tiempo:** ese estado no prueba que siga corriendo.

```sql
-- Si sale una fila, hay un tramo corriendo o por arrancar. Si no sale nada, la corrida murió
SELECT job_name, state FROM user_scheduler_jobs
 WHERE job_name LIKE 'BACKUP_MANUAL%' OR job_name LIKE 'BACKUP_TRAMO%';

-- Por qué terminó cada job
SELECT job_name, status, actual_start_date, run_duration, errors
  FROM user_scheduler_job_run_details
 WHERE job_name = 'JOB_BACKUP_PROY' OR job_name LIKE 'BACKUP_MANUAL%' OR job_name LIKE 'BACKUP_TRAMO%'
 ORDER BY actual_start_date DESC;

-- Detener una corrida, con el JOB_NAME de la primera consulta
BEGIN DBMS_SCHEDULER.STOP_JOB('<job_name>'); END;
```

- **Antes de volver a ejecutar el script, detener la corrida:** reemplazar el paquete mientras se usa
  deja el script esperando.
- **Una corrida muerta** queda `INTERRUMPIDA` cuando arranca la siguiente.
- **Cambiar el horario:** cambiar `BYHOUR` con `DBMS_SCHEDULER.SET_ATTRIBUTE` y dejarlo también en el
  `.sql`, o la próxima ejecución lo pisa.
- **Revisar los correos cada tanto:** un día sin resumen es un día sin copia, y nada más avisa.

## 9. Otra base de datos

**Oracle con APEX:** el anexo sirve con la sección 3. Falta comprobar en cada instancia que `APEX_MAIL`
tenga salida de correo configurada y que `APEX_EXPORT` y `ORDS_EXPORT` estén disponibles. Si no lo están,
el paquete compila igual y el resumen avisa `FALTA ...`.

**Oracle sin APEX:** la estructura y los datos sirven. Hay que cambiar estas piezas:

| En el anexo | Para qué | Sin APEX |
|---|---|---|
| `APEX_MAIL` en `enviar` y `empujar_cola` | Mandar el correo | `UTL_SMTP`, o el servicio de correo de la nube, con su permiso de red |
| `APEX_ZIP` en `cerrar_parte` y `probar_correo` | Comprimir | `UTL_COMPRESS.LZ_COMPRESS` (genera `.gz`) |
| `APEX_EXPORT` y `ORDS_EXPORT` | Aplicación y endpoints | Quitar las tareas `EXPORTAR`, o dejar `ORDS` si la base lo tiene |
| `contexto_apex` | Fijar el workspace | Quitarlo |

**Con acceso a la base desde otra máquina:** Oracle Data Pump (`expdp`) es más completo y más rápido que
este script. Este enfoque tiene sentido cuando no hay acceso al servidor, como en un workspace compartido.

**Otro motor:** este script no corre, porque usa paquetes propios de Oracle. Conviene la herramienta del
motor y una tarea programada en un servidor:

| Motor | Herramienta |
|---|---|
| PostgreSQL | `pg_dump`, con `--exclude-table-data` para las tablas con secretos |
| MySQL / MariaDB | `mysqldump --single-transaction --routines --triggers --events` |
| SQL Server | `BACKUP DATABASE`, con SQL Server Agent |

Lo que hay que mantener con cualquier motor:

- Un correo o aviso de resumen, también cuando falla.
- Un registro de cada corrida, escrito mientras corre.
- Sin claves en la copia, y destino solo del dueño, con la copia cifrada si es posible.
- La copia fuera del proveedor de la base: si dan de baja la cuenta, se pierden las dos.
- Una restauración de prueba.

## 10. Lo que ya falló

- **`ORA-02393` (límite de CPU por llamada):** en `oracleapex.com`, `CPU_PER_CALL` es de 20 minutos y
  `DBMS_METADATA` consume mucho. Un solo job se cortó a los 22 minutos, sin terminar la estructura.
- **Una corrida muerta no registra nada:** pasado el límite, en esa llamada también fallan el registro y
  los `EXCEPTION`. Por eso el avance se anota mientras corre y se para antes de llegar al límite.
- **`SUBSTR(x, 1, 3900)` en un `VARCHAR2(3900)`:** corta caracteres y la variable mide bytes. Con acentos
  da `ORA-06502` y tapa el error real. Usar `SUBSTRB`.
- **`WHEN OTHERS` en un bucle:** si se traga la cancelación o el límite, cada objeto siguiente falla igual
  y el detalle se llena. `ORA-01013`, `ORA-00040`, `ORA-00028` y `ORA-02393` se vuelven a lanzar.
- **`ORA-00942` al crear la tabla:** una tabla creada en un bloque no se puede usar con SQL estático en
  ese mismo bloque, y Oracle no crea nada. Usar `EXECUTE IMMEDIATE`.
- **`PLS-00231`:** una función privada del paquete no se puede usar dentro de SQL. Pasarla antes a una
  variable.

## 11. Límites conocidos

- **No es una foto única:** una transacción de solo lectura no cruza de un job a otro. Si alguien carga
  datos durante la copia, una venta puede quedar sin su detalle. Por eso corre de madrugada.
- **Copia solo el esquema propio:** no lleva los GRANT sobre objetos ni objetos de otros esquemas.
- **Exporta una sola aplicación APEX:** la de `APP_ID`. Para varias, agregar una tarea por cada una.
- **Tipos no soportados:** `LONG`, `XMLTYPE`, `JSON` y otros no se copian. El resumen los lista y queda
  `CON ERRORES`.
- **Tamaño del correo:** una parte de más de 18 MB comprimidos se avisa en el resumen, porque puede
  rebotar. Oracle y la casilla pueden tener topes propios.
- **Un objeto que supere él solo el margen del tramo corta la corrida:** queda sin resumen y el motivo
  aparece en `user_scheduler_job_run_details`.

---

## Anexo A: `backend/backup.sql`

```sql
--------------------------------------------------------------------------------
-- BACKUP  —  Copia completa del esquema, en scripts SQL y por correo
--------------------------------------------------------------------------------
--
-- Esta copia tiene que alcanzar para levantar el sistema en otro lado si se pierde
-- la base o el proveedor da de baja la cuenta.
--
-- QUÉ GENERA (archivos .sql en .zip, numerados en el orden de restauración)
--
--   NN_estructura  secuencias, tipos, tablas (con PK, UK, CHECK y NOT NULL),
--                  índices, comentarios, vistas, funciones, procedimientos,
--                  paquetes, vistas materializadas, triggers, FK, sinónimos y jobs.
--   NN_apex_ords   la aplicación APEX, el workspace y los módulos ORDS, si esta
--                  instancia deja exportarlos (si no, lo avisa el resumen).
--   NN_datos       un INSERT por fila. La primera parte apaga FK y triggers y
--                  prepara las columnas identity, para que restaurar no dispare
--                  nada. La última los vuelve a prender y ajusta los identity.
--
-- Cada corrida termina con un correo de RESUMEN: si no llegó, la corrida no
-- terminó. Si el resumen dice CON ERRORES, la copia NO está completa.
--
-- CORRE EN TRAMOS: la instancia limita la CPU por llamada (CPU_PER_CALL, ORA-02393) y
-- un job entero es una sola llamada. Cada tramo es un job, usa el 60 % del límite y
-- deja lo que falta en PROY_BACKUP_TAREA para el siguiente (BACKUP_TRAMO_*).
-- Por eso las tablas no se leen todas en la misma foto: conviene correrlo de madrugada,
-- sin nadie cargando.
--
-- QUÉ NO VA, A PROPÓSITO (los correos no son un lugar seguro para esto)
--
--   - Los DATOS de las tablas de c_sin_datos: las de control de esta copia y las que
--     se agreguen con claves o sesiones. Su estructura sí va. Se cargan a mano.
--   - Columnas de cualquier tabla cuyo nombre diga PASSWORD, API_KEY, TOKEN o
--     SECRET: van vacías y el resumen las lista.
--   - Las contraseñas de los usuarios de APEX no se pueden exportar en claro.
--   - Las imágenes (columnas BLOB), por decisión del dueño: se vuelven a cargar.
--     Si la columna es obligatoria, va EMPTY_BLOB() para que el INSERT no falle.
--   - Database links y permisos de red: se vuelven a configurar a mano.
--
-- OJO: el correo lleva clientes, costos y sueldos SIN cifrar. El destino tiene que
-- ser una casilla solo del dueño, con verificación en dos pasos.
--
-- Ejecutar completo como dueño del esquema, en SQL Workshop -> SQL Scripts. Idempotente.
--
-- Y DESPUÉS, EN SQL COMMANDS (la casilla no va en este archivo: se sube al repo):
--
--   1. BEGIN PKG_BACKUP_PROY.fijar_destino('la casilla'); END;
--   2. BEGIN PKG_BACKUP_PROY.probar_correo; END;
--      Tiene que llegar un correo con un .zip adjunto. Si no llega, mirar:
--        SELECT * FROM apex_mail_queue;   SELECT * FROM apex_mail_log;
--   3. Medir, SIN mandar nada (corre en segundo plano):
--        BEGIN PKG_BACKUP_PROY.lanzar(p_enviar => FALSE); END;
--        SELECT * FROM proy_backup_log ORDER BY id DESC;
--      PASO y PASO_EN dicen en qué va. EN CURSO no prueba que siga viva: la prueba es
--        SELECT job_name, elapsed_time FROM user_scheduler_running_jobs;
--   4. La primera copia, sin esperar a la madrugada:
--        BEGIN PKG_BACKUP_PROY.lanzar; END;
--
-- ANTES DE VOLVER A EJECUTAR ESTE SCRIPT, detener cualquier copia que esté corriendo:
-- reemplazar el paquete mientras se usa deja el script esperando.
--
-- HORARIO: job JOB_BACKUP_PROY, todos los días a las 03:00 hora local.
--
-- CONFIGURACIÓN (PROY_BACKUP_CONFIG; UPDATE + COMMIT, sin correr el script):
--
--   DESTINO    la casilla (con fijar_destino)
--   REMITENTE  el "De:" del correo. Por defecto, el mismo destino
--   PARTE_MB   30: tamaño de cada .sql antes de comprimir. Bajarlo si la casilla o
--              Oracle rechazan los adjuntos
--   APP_ID     MI_APP_ID: la aplicación APEX a exportar
--   CPU_SEG    opcional: segundos de CPU por tramo. Sin esto, el 60 % de CPU_PER_CALL
--
-- RESTAURAR: en otra base con APEX y ORDS, correr los .sql en orden de número con
-- SQLcl o SQL*Plus. Probarlo al menos una vez: una copia sin restaurar no está
-- probada.
--
--------------------------------------------------------------------------------

DECLARE
  FUNCTION existe(p_tabla IN VARCHAR2) RETURN BOOLEAN IS
    l_c PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO l_c FROM user_tables WHERE table_name = p_tabla;
    RETURN l_c > 0;
  END existe;
BEGIN
  IF NOT existe('PROY_BACKUP_CONFIG') THEN
    EXECUTE IMMEDIATE 'CREATE TABLE PROY_BACKUP_CONFIG (
        CLAVE VARCHAR2(60) NOT NULL,
        VALOR VARCHAR2(400),
        CONSTRAINT PK_PROY_BACKUP_CONFIG PRIMARY KEY (CLAVE))';
  END IF;

  IF NOT existe('PROY_BACKUP_LOG') THEN
    EXECUTE IMMEDIATE 'CREATE TABLE PROY_BACKUP_LOG (
        ID           NUMBER GENERATED BY DEFAULT AS IDENTITY,
        INICIO       DATE NOT NULL,
        FIN          DATE,
        ESTADO       VARCHAR2(20) NOT NULL,
        ENVIADO      CHAR(1),
        PARTES       NUMBER,
        TABLAS       NUMBER,
        FILAS        NUMBER,
        BYTES_SCRIPT NUMBER,
        BYTES_ZIP    NUMBER,
        DETALLE      VARCHAR2(4000),
        CONSTRAINT PK_PROY_BACKUP_LOG PRIMARY KEY (ID))';
  END IF;

  -- Lo que le falta a la corrida: cada tramo sigue desde acá.
  IF NOT existe('PROY_BACKUP_TAREA') THEN
    EXECUTE IMMEDIATE 'CREATE TABLE PROY_BACKUP_TAREA (
        CORRIDA    NUMBER NOT NULL,
        ORDEN      NUMBER NOT NULL,
        ETAPA      VARCHAR2(20) NOT NULL,
        SECCION    VARCHAR2(60),
        ACCION     VARCHAR2(20) NOT NULL,
        TIPO       VARCHAR2(30),
        NOMBRE     VARCHAR2(130),
        DESDE_FILA NUMBER DEFAULT 0 NOT NULL,
        CONSTRAINT PK_PROY_BACKUP_TAREA PRIMARY KEY (CORRIDA, ORDEN))';
  END IF;

  -- En qué va la corrida (PASO, PASO_EN) y los errores que arrastra entre tramos.
  FOR c IN (SELECT col, tipo
              FROM (SELECT 'PASO' AS col, 'VARCHAR2(200)' AS tipo FROM dual
                    UNION ALL SELECT 'PASO_EN', 'DATE' FROM dual
                    UNION ALL SELECT 'ERRORES', 'NUMBER' FROM dual)
             WHERE col NOT IN (SELECT column_name FROM user_tab_cols
                                WHERE table_name = 'PROY_BACKUP_LOG')) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE PROY_BACKUP_LOG ADD (' || c.col || ' ' || c.tipo || ')';
  END LOOP;

  -- Dinámico: al compilar este bloque la tabla todavía puede no existir.
  FOR c IN (SELECT 'PARTE_MB' AS clave, '30' AS valor FROM dual
            UNION ALL SELECT 'APP_ID', 'MI_APP_ID' FROM dual) LOOP
    EXECUTE IMMEDIATE 'MERGE INTO proy_backup_config t
        USING (SELECT :1 AS clave, :2 AS valor FROM dual) s
           ON (t.clave = s.clave)
         WHEN NOT MATCHED THEN INSERT (clave, valor) VALUES (s.clave, s.valor)'
      USING c.clave, c.valor;
  END LOOP;
  COMMIT;
END;
/

CREATE OR REPLACE PACKAGE PKG_BACKUP_PROY AS

  -- Genera la copia. p_enviar FALSE: solo mide, queda en PROY_BACKUP_LOG.
  -- Es lo que corre el job.
  PROCEDURE ejecutar(p_enviar IN BOOLEAN DEFAULT TRUE);

  -- Uso interno: sigue una corrida en un job nuevo cuando el tramo anterior agotó su CPU.
  PROCEDURE continuar(p_id IN NUMBER);

  -- Lo mismo, en segundo plano: una corrida larga no depende de la pantalla abierta.
  PROCEDURE lanzar(p_enviar IN BOOLEAN DEFAULT TRUE);

  -- La casilla que recibe las copias (y, opcional, el remitente).
  PROCEDURE fijar_destino(p_correo IN VARCHAR2, p_remitente IN VARCHAR2 DEFAULT NULL);

  -- Manda un correo chico con un .zip, para saber si esta instancia puede.
  PROCEDURE probar_correo;

END PKG_BACKUP_PROY;
/

CREATE OR REPLACE PACKAGE BODY PKG_BACKUP_PROY AS

  c_workspace CONSTANT VARCHAR2(64) := 'MI_WORKSPACE_APEX';
  c_desfase   CONSTANT NUMBER       := -3 / 24;  -- UTC -> hora local
  -- De estas tablas va la estructura, nunca los datos (ver el encabezado).
  c_sin_datos CONSTANT VARCHAR2(60) := '^(PROY_BACKUP_)';
  -- Estas columnas van vacías (ver el encabezado).
  c_col_secreta CONSTANT VARCHAR2(60) := 'PASSWORD|PASSWD|API_?KEY|TOKEN|SECRET';
  -- Un adjunto más grande que esto suele rebotar: se avisa en el resumen.
  c_zip_grande CONSTANT NUMBER := 18 * 1024 * 1024;

  g_parte   CLOB;
  g_buf     VARCHAR2(32767);
  g_chars   NUMBER := 0;
  g_ancho   PLS_INTEGER := 0;
  g_tope    NUMBER;
  g_fecha   VARCHAR2(10);
  g_tipo    VARCHAR2(30);
  g_n       PLS_INTEGER := 0;
  g_enviar  BOOLEAN := FALSE;
  g_destino VARCHAR2(400);
  g_desde   VARCHAR2(400);
  g_errores PLS_INTEGER := 0;
  g_detalle VARCHAR2(3900);
  g_tablas  NUMBER := 0;
  g_filas   NUMBER := 0;
  g_b_sql   NUMBER := 0;
  g_b_zip   NUMBER := 0;
  g_log     NUMBER;
  g_cpu0    NUMBER;
  g_cpu_max NUMBER;
  g_pausa   BOOLEAN := FALSE;

  ------------------------------------------------------------------------------
  -- AUXILIARES
  ------------------------------------------------------------------------------

  FUNCTION ahora RETURN DATE IS
  BEGIN
    RETURN CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE) + c_desfase;
  END ahora;

  FUNCTION config(p_clave IN VARCHAR2, p_defecto IN VARCHAR2 DEFAULT NULL) RETURN VARCHAR2 IS
    l_v proy_backup_config.valor%TYPE;
  BEGIN
    SELECT valor INTO l_v FROM proy_backup_config WHERE clave = p_clave;
    RETURN NVL(TRIM(l_v), p_defecto);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN RETURN p_defecto;
  END config;

  PROCEDURE anotar(p_txt IN VARCHAR2) IS
  BEGIN
    -- SUBSTRB: la variable mide bytes y con acentos 3900 caracteres no entran (ORA-06502).
    g_detalle := SUBSTRB(g_detalle || p_txt || CHR(10), 1, 3900);
  END anotar;

  PROCEDURE contexto_apex IS
  BEGIN
    APEX_UTIL.SET_SECURITY_GROUP_ID(APEX_UTIL.FIND_SECURITY_GROUP_ID(p_workspace => c_workspace));
  EXCEPTION
    WHEN OTHERS THEN NULL;  -- en SQL Workshop ya hay workspace
  END contexto_apex;

  -- Autónoma: la copia de los datos corre en una transacción de solo lectura.
  PROCEDURE enviar(p_asunto IN VARCHAR2, p_cuerpo IN VARCHAR2,
                   p_adjunto IN BLOB DEFAULT NULL, p_archivo IN VARCHAR2 DEFAULT NULL) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    l_id NUMBER;
  BEGIN
    contexto_apex;
    l_id := APEX_MAIL.SEND(p_to => g_destino, p_from => g_desde,
                           p_body => p_cuerpo, p_subj => p_asunto);
    IF p_adjunto IS NOT NULL THEN
      APEX_MAIL.ADD_ATTACHMENT(p_mail_id => l_id, p_attachment => p_adjunto,
                               p_filename => p_archivo, p_mime_type => 'application/zip');
    END IF;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END enviar;

  PROCEDURE empujar_cola IS
  BEGIN
    contexto_apex;
    APEX_MAIL.PUSH_QUEUE;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN NULL;  -- igual lo manda el job de la cola de APEX
  END empujar_cola;

  FUNCTION log_inicio(p_enviar IN BOOLEAN) RETURN NUMBER IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    l_id     NUMBER;
    -- En variables: una función privada del paquete no se puede usar dentro de SQL.
    l_ahora  DATE := ahora;
    l_enviar CHAR(1) := CASE WHEN p_enviar THEN 'S' ELSE 'N' END;
  BEGIN
    -- Una corrida cuya sesión murió no llega a anotar su final: quedaría EN CURSO para
    -- siempre. Si en realidad sigue viva, al terminar pisa este estado con el suyo.
    UPDATE proy_backup_log
       SET fin = l_ahora, estado = 'INTERRUMPIDA'
     WHERE estado = 'EN CURSO';
    DELETE FROM proy_backup_tarea
     WHERE corrida IN (SELECT id FROM proy_backup_log WHERE inicio < l_ahora - 3);
    INSERT INTO proy_backup_log (inicio, estado, enviado)
    VALUES (l_ahora, 'EN CURSO', l_enviar)
    RETURNING id INTO l_id;
    COMMIT;
    RETURN l_id;
  END log_inicio;

  PROCEDURE log_fin(p_id IN NUMBER, p_estado IN VARCHAR2) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    l_ahora DATE := ahora;
  BEGIN
    UPDATE proy_backup_log
       SET fin = l_ahora, estado = p_estado, partes = g_n, tablas = g_tablas, filas = g_filas,
           bytes_script = g_b_sql, bytes_zip = g_b_zip, errores = g_errores, detalle = g_detalle
     WHERE id = p_id;
    COMMIT;
  END log_fin;

  -- Autónoma: se tiene que ver mientras corre, y queda aunque la sesión muera después.
  PROCEDURE avance(p_paso IN VARCHAR2) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    l_ahora DATE := ahora;
    l_paso  VARCHAR2(200) := SUBSTRB(p_paso, 1, 200);
  BEGIN
    UPDATE proy_backup_log
       SET paso = l_paso, paso_en = l_ahora, partes = g_n, tablas = g_tablas, filas = g_filas,
           bytes_script = g_b_sql, bytes_zip = g_b_zip, errores = g_errores, detalle = g_detalle
     WHERE id = g_log;
    COMMIT;
  END avance;

  -- Cancelaron la corrida, mataron la sesión o se pasó de un límite de la instancia:
  -- los WHEN OTHERS por objeto no pueden tragárselo y seguir con el objeto siguiente.
  FUNCTION cancelada(p_codigo IN NUMBER) RETURN BOOLEAN IS
  BEGIN
    RETURN p_codigo IN (-1013, -40, -28, -2393);
  END cancelada;

  -- La CPU que puede usar un tramo, en centésimas de segundo. Hay que parar antes del
  -- límite: pasado el ORA-02393, en esa llamada ya no se puede ni anotar el error.
  FUNCTION presupuesto_cpu RETURN NUMBER IS
    l_seg    VARCHAR2(400) := config('CPU_SEG');
    l_limite VARCHAR2(40);
  BEGIN
    IF l_seg IS NOT NULL THEN
      RETURN TO_NUMBER(l_seg) * 100;
    END IF;
    SELECT "LIMIT" INTO l_limite FROM user_resource_limits WHERE resource_name = 'CPU_PER_CALL';
    IF REGEXP_LIKE(l_limite, '^[0-9]+$') THEN
      RETURN TRUNC(TO_NUMBER(l_limite) * 0.6);
    END IF;
    RETURN 30000;
  EXCEPTION
    WHEN OTHERS THEN RETURN 30000;
  END presupuesto_cpu;

  FUNCTION sin_cpu RETURN BOOLEAN IS
  BEGIN
    RETURN DBMS_UTILITY.GET_CPU_TIME - g_cpu0 > g_cpu_max;
  END sin_cpu;

  ------------------------------------------------------------------------------
  -- ESCRIBIR EL SCRIPT: de a pedazos, porque concatenar sobre un CLOB es lentísimo
  ------------------------------------------------------------------------------

  PROCEDURE volcar IS
  BEGIN
    IF g_buf IS NOT NULL THEN
      DBMS_LOB.WRITEAPPEND(g_parte, LENGTH(g_buf), g_buf);
      g_buf := NULL;
    END IF;
  END volcar;

  PROCEDURE poner(p_txt IN VARCHAR2) IS
  BEGIN
    IF p_txt IS NULL THEN
      RETURN;
    END IF;
    IF NVL(LENGTHB(g_buf), 0) + LENGTHB(p_txt) > 32000 THEN
      volcar;
    END IF;
    g_buf   := g_buf || p_txt;
    g_chars := g_chars + LENGTH(p_txt);
    g_ancho := g_ancho + LENGTH(p_txt);
  END poner;

  PROCEDURE linea(p_txt IN VARCHAR2 DEFAULT NULL) IS
  BEGIN
    poner(p_txt);
    poner(CHR(10));
    g_ancho := 0;
  END linea;

  -- Cortar la línea: SQL*Plus no acepta líneas muy largas.
  PROCEDURE cortar IS
  BEGIN
    IF g_ancho > 1500 THEN
      linea;
    END IF;
  END cortar;

  PROCEDURE poner_clob(p_txt IN CLOB) IS
    l_pos NUMBER := 1;
    l_len NUMBER := NVL(DBMS_LOB.GETLENGTH(p_txt), 0);
  BEGIN
    WHILE l_pos <= l_len LOOP
      poner(DBMS_LOB.SUBSTR(p_txt, 7000, l_pos));
      l_pos := l_pos + 7000;
    END LOOP;
  END poner_clob;

  -- Un texto como literal, en pedazos: un literal de SQL tiene tope de largo.
  PROCEDURE poner_texto(p_txt IN VARCHAR2) IS
    l_pos PLS_INTEGER := 1;
  BEGIN
    IF p_txt IS NULL THEN
      poner('NULL');
      RETURN;
    END IF;
    WHILE l_pos <= LENGTH(p_txt) LOOP
      IF l_pos > 1 THEN
        linea('||');
      END IF;
      poner('''' || REPLACE(SUBSTR(p_txt, l_pos, 900), '''', '''''') || '''');
      l_pos := l_pos + 900;
    END LOOP;
  END poner_texto;

  PROCEDURE poner_clob_literal(p_txt IN CLOB) IS
    l_pos NUMBER := 1;
    l_len NUMBER := NVL(DBMS_LOB.GETLENGTH(p_txt), 0);
  BEGIN
    IF l_len = 0 THEN
      poner('NULL');
      RETURN;
    END IF;
    WHILE l_pos <= l_len LOOP
      IF l_pos > 1 THEN
        linea('||');
      END IF;
      poner('TO_CLOB(''' || REPLACE(DBMS_LOB.SUBSTR(p_txt, 900, l_pos), '''', '''''') || ''')');
      l_pos := l_pos + 900;
    END LOOP;
  END poner_clob_literal;

  ------------------------------------------------------------------------------
  -- LAS PARTES
  ------------------------------------------------------------------------------

  PROCEDURE abrir_parte(p_tipo IN VARCHAR2) IS
  BEGIN
    g_tipo  := p_tipo;
    g_n     := g_n + 1;
    g_chars := 0;
    g_ancho := 0;
    g_buf   := NULL;
    DBMS_LOB.CREATETEMPORARY(g_parte, TRUE, DBMS_LOB.SESSION);
    linea('-- Backup de PROY del ' || g_fecha || ', parte ' || g_n || ' (' || p_tipo || ').');
    linea('-- Correr las partes en orden de número, con SQLcl o SQL*Plus.');
    linea('SET DEFINE OFF');
    linea('SET SQLBLANKLINES ON');
    linea('SET FEEDBACK OFF');
    linea('WHENEVER SQLERROR CONTINUE');
    linea;
  END abrir_parte;

  PROCEDURE cerrar_parte IS
    l_bin    BLOB;
    l_zip    BLOB;
    l_do     INTEGER := 1;
    l_so     INTEGER := 1;
    l_ctx    INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    l_warn   INTEGER;
    l_nombre VARCHAR2(100) := 'proy_' || g_fecha || '_' || LPAD(g_n, 2, '0') || '_' || g_tipo;
    l_tam    NUMBER;
  BEGIN
    avance('Comprimiendo la parte ' || g_n || ' (' || g_tipo || ')');
    volcar;
    DBMS_LOB.CREATETEMPORARY(l_bin, TRUE, DBMS_LOB.SESSION);
    DBMS_LOB.CONVERTTOBLOB(l_bin, g_parte, DBMS_LOB.LOBMAXSIZE, l_do, l_so,
                           NLS_CHARSET_ID('AL32UTF8'), l_ctx, l_warn);
    g_b_sql := g_b_sql + DBMS_LOB.GETLENGTH(l_bin);

    APEX_ZIP.ADD_FILE(p_zipped_blob => l_zip, p_file_name => l_nombre || '.sql', p_content => l_bin);
    APEX_ZIP.FINISH(p_zipped_blob => l_zip);
    l_tam   := DBMS_LOB.GETLENGTH(l_zip);
    g_b_zip := g_b_zip + l_tam;

    IF l_tam > c_zip_grande THEN
      anotar('Parte ' || g_n || ' pesa ' || ROUND(l_tam / 1048576, 1)
             || ' MB: puede rebotar. Bajar PARTE_MB.');
    END IF;
    IF g_enviar THEN
      enviar('Backup PROY ' || g_fecha || ', parte ' || LPAD(g_n, 2, '0') || ' (' || g_tipo || ')',
             'Parte ' || g_n || ' del backup del ' || g_fecha || '. Al terminar llega un correo de resumen.',
             l_zip, l_nombre || '.zip');
    END IF;

    DBMS_LOB.FREETEMPORARY(l_bin);
    IF DBMS_LOB.ISTEMPORARY(l_zip) = 1 THEN
      DBMS_LOB.FREETEMPORARY(l_zip);
    END IF;
    DBMS_LOB.FREETEMPORARY(g_parte);
  END cerrar_parte;

  PROCEDURE seguir_parte IS
  BEGIN
    IF g_chars > g_tope THEN
      linea('COMMIT;');
      cerrar_parte;
      abrir_parte(g_tipo);
    END IF;
  END seguir_parte;

  ------------------------------------------------------------------------------
  -- ESTRUCTURA
  ------------------------------------------------------------------------------

  PROCEDURE transformar(p_param IN VARCHAR2, p_valor IN BOOLEAN) IS
  BEGIN
    DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, p_param, p_valor);
  EXCEPTION
    WHEN OTHERS THEN anotar('Sin el ajuste ' || p_param || ': ' || SUBSTR(SQLERRM, 1, 120));
  END transformar;

  PROCEDURE ddl(p_tipo IN VARCHAR2, p_nombre IN VARCHAR2, p_dependiente IN BOOLEAN DEFAULT FALSE) IS
    l_txt CLOB;
  BEGIN
    avance(p_tipo || ' ' || p_nombre);
    IF p_dependiente THEN
      l_txt := DBMS_METADATA.GET_DEPENDENT_DDL(p_tipo, p_nombre);
    ELSE
      l_txt := DBMS_METADATA.GET_DDL(p_tipo, p_nombre);
    END IF;
    poner_clob(l_txt);
    linea;
  EXCEPTION
    WHEN OTHERS THEN
      IF cancelada(SQLCODE) THEN
        RAISE;
      END IF;
      -- ORA-31608: la tabla no tiene ese dependiente (FK, comentarios): es normal.
      IF NOT (p_dependiente AND SQLCODE = -31608) THEN
        g_errores := g_errores + 1;
        linea('-- ERROR en ' || p_tipo || ' ' || p_nombre || ': ' || SUBSTR(SQLERRM, 1, 200));
        anotar('ERROR en ' || p_tipo || ' ' || p_nombre || ': ' || SUBSTR(SQLERRM, 1, 200));
      END IF;
  END ddl;

  PROCEDURE titulo(p_txt IN VARCHAR2) IS
  BEGIN
    linea;
    linea('-- === ' || p_txt || ' ===');
    linea;
  END titulo;

  -- Valen para la sesión: cada tramo los vuelve a fijar.
  PROCEDURE preparar_metadata IS
  BEGIN
    transformar('SQLTERMINATOR', TRUE);
    transformar('PRETTY', TRUE);
    transformar('SEGMENT_ATTRIBUTES', FALSE);
    transformar('STORAGE', FALSE);
    transformar('TABLESPACE', FALSE);
    transformar('EMIT_SCHEMA', FALSE);
    transformar('CONSTRAINTS', TRUE);        -- PK, UK, CHECK y NOT NULL, con la tabla
    transformar('REF_CONSTRAINTS', FALSE);   -- las FK van al final
  END preparar_metadata;

  ------------------------------------------------------------------------------
  -- APEX Y ORDS: dinámico, porque esta instancia puede no permitirlo y eso no tiene
  -- que impedir compilar el paquete ni cortar la copia de los datos.
  ------------------------------------------------------------------------------

  PROCEDURE exportar(p_titulo IN VARCHAR2, p_bloque IN VARCHAR2, p_num IN NUMBER DEFAULT NULL) IS
    l_txt CLOB;
  BEGIN
    avance('Exportando ' || p_titulo);
    titulo(p_titulo);
    IF p_num IS NULL THEN
      EXECUTE IMMEDIATE p_bloque USING OUT l_txt;
    ELSE
      EXECUTE IMMEDIATE p_bloque USING IN p_num, OUT l_txt;
    END IF;
    IF NVL(DBMS_LOB.GETLENGTH(l_txt), 0) = 0 THEN
      g_errores := g_errores + 1;
      anotar('FALTA ' || p_titulo || ': vino vacío.');
    END IF;
    poner_clob(l_txt);
    linea;
  EXCEPTION
    WHEN OTHERS THEN
      IF cancelada(SQLCODE) THEN
        RAISE;
      END IF;
      g_errores := g_errores + 1;
      linea('-- NO SE PUDO EXPORTAR ' || p_titulo || ': ' || SUBSTR(SQLERRM, 1, 200));
      anotar('FALTA ' || p_titulo || ': ' || SUBSTR(SQLERRM, 1, 200)
             || '. Exportarlo a mano desde APEX.');
  END exportar;

  PROCEDURE exportar_apex_ords(p_que IN VARCHAR2) IS
    l_ws NUMBER;
  BEGIN
    contexto_apex;
    IF p_que = 'APLICACION' THEN
      exportar('LA APLICACIÓN APEX',
        'DECLARE f apex_t_export_files; BEGIN '
        || 'f := APEX_EXPORT.GET_APPLICATION(p_application_id => :1); :2 := f(1).contents; END;',
        TO_NUMBER(config('APP_ID', 'MI_APP_ID')));
    ELSIF p_que = 'WORKSPACE' THEN
      BEGIN
        l_ws := APEX_UTIL.FIND_SECURITY_GROUP_ID(p_workspace => c_workspace);
      EXCEPTION
        WHEN OTHERS THEN l_ws := -1;
      END;
      exportar('EL WORKSPACE DE APEX (usuarios)',
        'DECLARE f apex_t_export_files; BEGIN '
        || 'f := APEX_EXPORT.GET_WORKSPACE(p_workspace_id => :1); :2 := f(1).contents; END;', l_ws);
    ELSE
      exportar('LOS MÓDULOS ORDS', 'BEGIN :1 := ORDS_METADATA.ORDS_EXPORT.EXPORT_SCHEMA(); END;');
    END IF;
  END exportar_apex_ords;

  ------------------------------------------------------------------------------
  -- DATOS
  ------------------------------------------------------------------------------

  PROCEDURE preparar_restauracion IS
  BEGIN
    titulo('APAGAR FK Y TRIGGERS MIENTRAS SE CARGAN LOS DATOS');
    FOR c IN (SELECT table_name, constraint_name FROM user_constraints
               WHERE constraint_type = 'R' AND status = 'ENABLED' AND table_name NOT LIKE '%$%') LOOP
      linea('ALTER TABLE "' || c.table_name || '" DISABLE CONSTRAINT "' || c.constraint_name || '";');
    END LOOP;
    FOR t IN (SELECT trigger_name FROM user_triggers
               WHERE status = 'ENABLED' AND base_object_type = 'TABLE' AND table_name NOT LIKE '%$%') LOOP
      linea('ALTER TRIGGER "' || t.trigger_name || '" DISABLE;');
    END LOOP;
    -- Un identity GENERATED ALWAYS rechazaría el valor original de la columna.
    FOR i IN (SELECT table_name, column_name FROM user_tab_identity_cols
               WHERE generation_type = 'ALWAYS' AND table_name NOT LIKE '%$%') LOOP
      linea('ALTER TABLE "' || i.table_name || '" MODIFY "' || i.column_name
            || '" GENERATED BY DEFAULT AS IDENTITY;');
    END LOOP;
  END preparar_restauracion;

  PROCEDURE terminar_restauracion IS
  BEGIN
    titulo('VOLVER A PRENDER LO QUE SE APAGÓ Y AJUSTAR LOS IDENTITY');
    FOR i IN (SELECT i.table_name, i.column_name, i.generation_type, c.default_on_null
                FROM user_tab_identity_cols i
                JOIN user_tab_cols c ON c.table_name = i.table_name AND c.column_name = i.column_name
               WHERE i.table_name NOT LIKE '%$%') LOOP
      linea('ALTER TABLE "' || i.table_name || '" MODIFY "' || i.column_name || '" GENERATED '
            || i.generation_type || CASE WHEN i.default_on_null = 'YES' THEN ' ON NULL' END
            || ' AS IDENTITY (START WITH LIMIT VALUE);');
    END LOOP;
    FOR c IN (SELECT table_name, constraint_name FROM user_constraints
               WHERE constraint_type = 'R' AND status = 'ENABLED' AND table_name NOT LIKE '%$%') LOOP
      linea('ALTER TABLE "' || c.table_name || '" ENABLE CONSTRAINT "' || c.constraint_name || '";');
    END LOOP;
    FOR t IN (SELECT trigger_name FROM user_triggers
               WHERE status = 'ENABLED' AND base_object_type = 'TABLE' AND table_name NOT LIKE '%$%') LOOP
      linea('ALTER TRIGGER "' || t.trigger_name || '" ENABLE;');
    END LOOP;
    linea('COMMIT;');
  END terminar_restauracion;

  -- p_desde: las filas que ya copió un tramo anterior. Si se acaba la CPU en medio de la
  -- tabla, deja anotado hasta dónde llegó y prende g_pausa.
  PROCEDURE datos_tabla(p_orden IN NUMBER, p_tabla IN VARCHAR2, p_desde IN NUMBER) IS
    TYPE t_txt IS TABLE OF VARCHAR2(30) INDEX BY PLS_INTEGER;
    l_clase  t_txt;
    l_sel    VARCHAR2(32767);
    l_ins    VARCHAR2(32767);
    l_n      PLS_INTEGER := 0;
    l_cur    INTEGER;
    l_ign    INTEGER;
    l_val    VARCHAR2(32767);
    l_clob   CLOB;
    l_filas  NUMBER := 0;
    l_clase1 VARCHAR2(1);
    l_expr   VARCHAR2(400);
    l_col    VARCHAR2(140);
  BEGIN
    FOR c IN (SELECT column_name, data_type, nullable FROM user_tab_cols
               WHERE table_name = p_tabla AND hidden_column = 'NO' AND virtual_column = 'NO'
               ORDER BY column_id) LOOP
      l_col    := '"' || c.column_name || '"';
      l_clase1 := NULL;
      IF REGEXP_LIKE(c.column_name, c_col_secreta, 'i') THEN
        IF p_desde = 0 THEN
          anotar('Sin copiar (dato secreto): ' || p_tabla || '.' || c.column_name);
        END IF;
      ELSIF c.data_type IN ('NUMBER', 'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE') THEN
        l_clase1 := 'N';
        l_expr   := 'TO_CHAR(' || l_col || ', ''TM9'', ''NLS_NUMERIC_CHARACTERS=''''.,'''''')';
      ELSIF c.data_type IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR') THEN
        l_clase1 := 'T';
        l_expr   := l_col;
      ELSIF c.data_type = 'DATE' THEN
        l_clase1 := 'D';
        l_expr   := 'TO_CHAR(' || l_col || ', ''YYYY-MM-DD HH24:MI:SS'')';
      ELSIF c.data_type LIKE 'TIMESTAMP%TIME ZONE' THEN
        l_clase1 := 'Z';
        l_expr   := 'TO_CHAR(' || l_col || ', ''YYYY-MM-DD HH24:MI:SS.FF9 TZH:TZM'')';
      ELSIF c.data_type LIKE 'TIMESTAMP%' THEN
        l_clase1 := 'M';
        l_expr   := 'TO_CHAR(' || l_col || ', ''YYYY-MM-DD HH24:MI:SS.FF9'')';
      ELSIF c.data_type IN ('CLOB', 'NCLOB') THEN
        l_clase1 := 'C';
        l_expr   := 'TO_CLOB(' || l_col || ')';
      ELSIF c.data_type = 'RAW' THEN
        l_clase1 := 'R';
        l_expr   := 'RAWTOHEX(' || l_col || ')';
      ELSIF c.data_type = 'BLOB' THEN
        -- Las imágenes no se copian. Obligatoria: vacía, para que el INSERT no falle.
        IF c.nullable = 'N' THEN
          l_clase1 := 'E';
          l_expr   := 'NULL';
        END IF;
      ELSIF p_desde = 0 THEN
        g_errores := g_errores + 1;
        anotar('Sin copiar (tipo ' || c.data_type || '): ' || p_tabla || '.' || c.column_name);
      END IF;
      IF l_clase1 IS NOT NULL THEN
        l_n := l_n + 1;
        l_clase(l_n) := l_clase1;
        l_sel := l_sel || CASE WHEN l_n > 1 THEN ', ' END || l_expr;
        l_ins := l_ins || CASE WHEN l_n > 1 THEN ',' END
                 || CASE WHEN MOD(l_n, 10) = 0 THEN CHR(10) END || l_col;
      END IF;
    END LOOP;
    IF l_n = 0 THEN
      RETURN;
    END IF;
    l_ins := 'INSERT INTO "' || p_tabla || '" (' || l_ins || ')' || CHR(10) || 'VALUES (';

    avance('Datos de ' || p_tabla);
    titulo('DATOS DE ' || p_tabla);
    l_cur := DBMS_SQL.OPEN_CURSOR;
    -- ORDER BY ROWID: el tramo siguiente tiene que encontrar las filas en el mismo orden.
    DBMS_SQL.PARSE(l_cur, 'SELECT ' || l_sel || ' FROM "' || p_tabla || '" ORDER BY ROWID'
      || CASE WHEN p_desde > 0 THEN ' OFFSET ' || p_desde || ' ROWS' END, DBMS_SQL.NATIVE);
    FOR i IN 1 .. l_n LOOP
      IF l_clase(i) = 'C' THEN
        DBMS_SQL.DEFINE_COLUMN(l_cur, i, l_clob);
      ELSE
        DBMS_SQL.DEFINE_COLUMN(l_cur, i, l_val, 32767);
      END IF;
    END LOOP;
    l_ign := DBMS_SQL.EXECUTE(l_cur);

    WHILE DBMS_SQL.FETCH_ROWS(l_cur) > 0 LOOP
      poner(l_ins);
      FOR i IN 1 .. l_n LOOP
        IF i > 1 THEN
          poner(',');
          cortar;
        END IF;
        IF l_clase(i) = 'E' THEN
          poner('EMPTY_BLOB()');
        ELSIF l_clase(i) = 'C' THEN
          DBMS_SQL.COLUMN_VALUE(l_cur, i, l_clob);
          poner_clob_literal(l_clob);
        ELSE
          DBMS_SQL.COLUMN_VALUE(l_cur, i, l_val);
          IF l_val IS NULL THEN
            poner('NULL');
          ELSIF l_clase(i) = 'N' THEN
            poner(l_val);
          ELSIF l_clase(i) = 'T' THEN
            poner_texto(l_val);
          ELSIF l_clase(i) = 'D' THEN
            poner('TO_DATE(''' || l_val || ''',''YYYY-MM-DD HH24:MI:SS'')');
          ELSIF l_clase(i) = 'M' THEN
            poner('TO_TIMESTAMP(''' || l_val || ''',''YYYY-MM-DD HH24:MI:SS.FF9'')');
          ELSIF l_clase(i) = 'Z' THEN
            poner('TO_TIMESTAMP_TZ(''' || l_val || ''',''YYYY-MM-DD HH24:MI:SS.FF9 TZH:TZM'')');
          ELSE
            poner('HEXTORAW(''' || l_val || ''')');
          END IF;
        END IF;
      END LOOP;
      linea(');');
      l_filas := l_filas + 1;
      IF MOD(l_filas, 500) = 0 THEN
        linea('COMMIT;');
      END IF;
      IF MOD(l_filas, 5000) = 0 THEN
        avance('Datos de ' || p_tabla || ': ' || (p_desde + l_filas) || ' filas');
      END IF;
      IF MOD(l_filas, 200) = 0 AND sin_cpu THEN
        g_pausa := TRUE;
        EXIT;
      END IF;
      seguir_parte;
    END LOOP;
    DBMS_SQL.CLOSE_CURSOR(l_cur);
    linea('COMMIT;');
    g_filas := g_filas + l_filas;
    IF g_pausa THEN
      UPDATE proy_backup_tarea
         SET desde_fila = p_desde + l_filas
       WHERE corrida = g_log AND orden = p_orden;
      COMMIT;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF l_cur IS NOT NULL AND DBMS_SQL.IS_OPEN(l_cur) THEN
        DBMS_SQL.CLOSE_CURSOR(l_cur);
      END IF;
      IF cancelada(SQLCODE) THEN
        RAISE;
      END IF;
      g_errores := g_errores + 1;
      linea('-- ERROR en los datos de ' || p_tabla || ': ' || SUBSTR(SQLERRM, 1, 200));
      anotar('ERROR en los datos de ' || p_tabla || ': ' || SUBSTR(SQLERRM, 1, 200));
  END datos_tabla;

  ------------------------------------------------------------------------------
  -- LOS TRAMOS: la lista de lo que hay que hacer, y cada job hace lo que le alcanza
  ------------------------------------------------------------------------------

  PROCEDURE armar_tareas IS
    l_orden NUMBER := 0;

    PROCEDURE agregar(p_etapa IN VARCHAR2, p_seccion IN VARCHAR2, p_accion IN VARCHAR2,
                      p_tipo IN VARCHAR2 DEFAULT NULL, p_nombre IN VARCHAR2 DEFAULT NULL) IS
    BEGIN
      l_orden := l_orden + 1;
      INSERT INTO proy_backup_tarea (corrida, orden, etapa, seccion, accion, tipo, nombre)
      VALUES (g_log, l_orden, p_etapa, p_seccion, p_accion, p_tipo, p_nombre);
    END agregar;

    PROCEDURE objetos(p_titulo IN VARCHAR2, p_tipo_dic IN VARCHAR2, p_tipo_meta IN VARCHAR2) IS
    BEGIN
      FOR o IN (SELECT object_name FROM user_objects
                 WHERE object_type = p_tipo_dic
                   AND generated = 'N'
                   AND object_name NOT LIKE '%$%'
                 ORDER BY object_name) LOOP
        agregar('estructura', p_titulo, 'DDL', p_tipo_meta, o.object_name);
      END LOOP;
    END objetos;
  BEGIN
    FOR s IN (SELECT sequence_name FROM user_sequences
               WHERE sequence_name NOT LIKE 'ISEQ$$%' ORDER BY sequence_name) LOOP
      agregar('estructura', 'SECUENCIAS', 'DDL', 'SEQUENCE', s.sequence_name);
    END LOOP;

    objetos('TIPOS', 'TYPE', 'TYPE_SPEC');

    FOR t IN (SELECT table_name FROM user_tables
               WHERE nested = 'NO' AND secondary = 'N' AND dropped = 'NO'
                 AND (iot_type IS NULL OR iot_type = 'IOT')
                 AND table_name NOT LIKE '%$%'
                 AND table_name NOT IN (SELECT mview_name FROM user_mviews)
               ORDER BY table_name) LOOP
      agregar('estructura', 'TABLAS (con PK, UK, CHECK y NOT NULL)', 'DDL', 'TABLE', t.table_name);
      agregar('estructura', 'TABLAS (con PK, UK, CHECK y NOT NULL)', 'DEP', 'COMMENT', t.table_name);
    END LOOP;

    FOR i IN (SELECT i.index_name FROM user_indexes i
               WHERE i.generated = 'N'
                 AND i.index_type NOT IN ('LOB', 'IOT - TOP')
                 AND i.table_name NOT LIKE '%$%'
                 AND NOT EXISTS (SELECT 1 FROM user_constraints c WHERE c.index_name = i.index_name)
               ORDER BY i.index_name) LOOP
      agregar('estructura', 'ÍNDICES', 'DDL', 'INDEX', i.index_name);
    END LOOP;

    objetos('VISTAS', 'VIEW', 'VIEW');
    objetos('FUNCIONES', 'FUNCTION', 'FUNCTION');
    objetos('PROCEDIMIENTOS', 'PROCEDURE', 'PROCEDURE');
    objetos('PAQUETES', 'PACKAGE', 'PACKAGE_SPEC');
    objetos('CUERPOS DE PAQUETES', 'PACKAGE BODY', 'PACKAGE_BODY');
    objetos('CUERPOS DE TIPOS', 'TYPE BODY', 'TYPE_BODY');
    objetos('VISTAS MATERIALIZADAS', 'MATERIALIZED VIEW', 'MATERIALIZED_VIEW');
    objetos('TRIGGERS', 'TRIGGER', 'TRIGGER');

    FOR t IN (SELECT DISTINCT table_name FROM user_constraints
               WHERE constraint_type = 'R' AND table_name NOT LIKE '%$%' ORDER BY table_name) LOOP
      agregar('estructura', 'CLAVES FORÁNEAS', 'DEP', 'REF_CONSTRAINT', t.table_name);
    END LOOP;

    objetos('SINÓNIMOS', 'SYNONYM', 'SYNONYM');

    -- Sin los jobs de las corridas: al restaurar dispararían una copia y sus correos.
    FOR j IN (SELECT job_name FROM user_scheduler_jobs
               WHERE job_name NOT LIKE 'BACKUP_MANUAL%' AND job_name NOT LIKE 'BACKUP_TRAMO%'
               ORDER BY job_name) LOOP
      agregar('estructura', 'JOBS', 'DDL', 'PROCOBJ', j.job_name);
    END LOOP;

    agregar('apex_ords', NULL, 'EXPORTAR', 'APLICACION');
    agregar('apex_ords', NULL, 'EXPORTAR', 'WORKSPACE');
    agregar('apex_ords', NULL, 'EXPORTAR', 'ORDS');

    agregar('datos', NULL, 'PREPARAR');
    FOR t IN (SELECT table_name FROM user_tables
               WHERE temporary = 'N' AND nested = 'NO' AND secondary = 'N' AND dropped = 'NO'
                 AND (iot_type IS NULL OR iot_type = 'IOT')
                 AND table_name NOT LIKE '%$%'
                 AND NOT REGEXP_LIKE(table_name, c_sin_datos)
                 AND table_name NOT IN (SELECT mview_name FROM user_mviews)
                 AND table_name NOT IN (SELECT table_name FROM user_external_tables)
               ORDER BY table_name) LOOP
      agregar('datos', NULL, 'DATOS', NULL, t.table_name);
    END LOOP;
    agregar('datos', NULL, 'TERMINAR');
    COMMIT;
  END armar_tareas;

  PROCEDURE programar_tramo IS
  BEGIN
    DBMS_SCHEDULER.CREATE_JOB(
      job_name   => DBMS_SCHEDULER.GENERATE_JOB_NAME('BACKUP_TRAMO_'),
      job_type   => 'PLSQL_BLOCK',
      job_action => 'BEGIN PKG_BACKUP_PROY.continuar(' || g_log || '); END;',
      start_date => SYSTIMESTAMP,
      enabled    => TRUE,
      auto_drop  => TRUE);
  END programar_tramo;

  PROCEDURE terminar IS
    l_estado VARCHAR2(20) := CASE WHEN g_errores > 0 THEN 'CON ERRORES' ELSE 'OK' END;
    l_cuerpo VARCHAR2(4000);
  BEGIN
    log_fin(g_log, l_estado);
    l_cuerpo := SUBSTRB('Backup del ' || g_fecha || ': ' || l_estado || CHR(10)
      || CASE WHEN g_errores > 0 THEN 'ATENCIÓN: esta copia NO está completa. Ver el detalle.' || CHR(10) END
      || 'Partes: ' || g_n || CHR(10)
      || 'Tablas: ' || g_tablas || CHR(10)
      || 'Filas: ' || g_filas || CHR(10)
      || 'Comprimido: ' || ROUND(g_b_zip / 1048576, 1) || ' MB (sin comprimir: '
      || ROUND(g_b_sql / 1048576, 1) || ' MB)' || CHR(10) || CHR(10)
      || 'Para restaurar: correr las partes en orden de número, con SQLcl o SQL*Plus.' || CHR(10)
      || 'No incluye imágenes ni claves: se vuelven a cargar a mano.' || CHR(10)
      || CASE WHEN g_detalle IS NOT NULL THEN CHR(10) || 'Detalle:' || CHR(10) || g_detalle END, 1, 4000);
    IF g_enviar THEN
      enviar('Backup PROY ' || g_fecha || ': ' || l_estado || ', ' || g_n || ' partes', l_cuerpo);
      empujar_cola;
    END IF;
    DELETE FROM proy_backup_tarea WHERE corrida = g_log;
    COMMIT;
    DBMS_OUTPUT.PUT_LINE(l_cuerpo);
  END terminar;

  -- Hace tareas hasta agotar la CPU del tramo. Cada parte se cierra (y se manda) dentro
  -- del tramo: entre un job y otro no sobrevive nada que esté en memoria.
  PROCEDURE tramo IS
    l_abierta BOOLEAN := FALSE;
    l_etapa   VARCHAR2(20);
    l_seccion VARCHAR2(60);
    l_quedan  PLS_INTEGER;
  BEGIN
    g_cpu_max := presupuesto_cpu;
    g_pausa   := FALSE;
    preparar_metadata;

    FOR t IN (SELECT orden, etapa, seccion, accion, tipo, nombre, desde_fila
                FROM proy_backup_tarea
               WHERE corrida = g_log
               ORDER BY orden) LOOP
      IF sin_cpu THEN
        g_pausa := TRUE;
        EXIT;
      END IF;
      IF NOT l_abierta OR t.etapa <> l_etapa THEN
        IF l_abierta THEN
          cerrar_parte;
        END IF;
        abrir_parte(t.etapa);
        l_abierta := TRUE;
        l_etapa   := t.etapa;
        l_seccion := NULL;
      END IF;
      IF t.seccion IS NOT NULL AND (l_seccion IS NULL OR t.seccion <> l_seccion) THEN
        titulo(t.seccion);
        l_seccion := t.seccion;
      END IF;

      IF t.accion = 'DDL' THEN
        ddl(t.tipo, t.nombre);
        IF t.tipo = 'TABLE' THEN
          g_tablas := g_tablas + 1;
        END IF;
      ELSIF t.accion = 'DEP' THEN
        ddl(t.tipo, t.nombre, TRUE);
      ELSIF t.accion = 'EXPORTAR' THEN
        exportar_apex_ords(t.tipo);
      ELSIF t.accion = 'PREPARAR' THEN
        preparar_restauracion;
      ELSIF t.accion = 'DATOS' THEN
        datos_tabla(t.orden, t.nombre, t.desde_fila);
      ELSE
        terminar_restauracion;
      END IF;

      EXIT WHEN g_pausa;  -- la tabla quedó a medias: esta tarea sigue pendiente
      DELETE FROM proy_backup_tarea WHERE corrida = g_log AND orden = t.orden;
      COMMIT;
    END LOOP;

    IF l_abierta THEN
      cerrar_parte;
    END IF;

    SELECT COUNT(*) INTO l_quedan FROM proy_backup_tarea WHERE corrida = g_log;
    IF l_quedan > 0 THEN
      avance('Sigue en otro tramo. Faltan ' || l_quedan || ' tareas');
      programar_tramo;
    ELSE
      terminar;
    END IF;
  END tramo;

  PROCEDURE leer_config IS
  BEGIN
    g_tope    := NVL(TO_NUMBER(config('PARTE_MB', '30')), 30) * 1048576;
    g_destino := config('DESTINO');
    g_desde   := config('REMITENTE', g_destino);
  END leer_config;

  -- Después de un ORA-02393 ya no se puede escribir nada: el motivo queda igual en
  -- USER_SCHEDULER_JOB_RUN_DETAILS y la corrida siguiente la marca INTERRUMPIDA.
  PROCEDURE registrar_corte(p_msg IN VARCHAR2) IS
  BEGIN
    anotar('La copia se cortó: ' || p_msg);
    BEGIN
      ROLLBACK;
      log_fin(g_log, 'ERROR');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    IF g_enviar AND g_destino IS NOT NULL THEN
      BEGIN
        enviar('Backup PROY ' || g_fecha || ': ERROR, la copia NO se completó',
               'La copia se cortó: ' || p_msg || CHR(10) || CHR(10) || g_detalle);
        empujar_cola;
      EXCEPTION
        WHEN OTHERS THEN NULL;  -- sin correo, igual queda en PROY_BACKUP_LOG
      END;
    END IF;
  END registrar_corte;

  ------------------------------------------------------------------------------
  -- LO PÚBLICO
  ------------------------------------------------------------------------------

  PROCEDURE ejecutar(p_enviar IN BOOLEAN DEFAULT TRUE) IS
  BEGIN
    g_cpu0   := DBMS_UTILITY.GET_CPU_TIME;
    g_enviar := p_enviar;
    g_n := 0; g_errores := 0; g_detalle := NULL; g_tablas := 0; g_filas := 0;
    g_b_sql := 0; g_b_zip := 0;
    g_fecha := TO_CHAR(ahora, 'YYYY-MM-DD');
    leer_config;

    g_log := log_inicio(p_enviar);
    IF p_enviar AND g_destino IS NULL THEN
      anotar('Falta la casilla: PKG_BACKUP_PROY.fijar_destino.');
      log_fin(g_log, 'ERROR');
      RAISE_APPLICATION_ERROR(-20001, 'Falta la casilla: PKG_BACKUP_PROY.fijar_destino.');
    END IF;

    armar_tareas;
    tramo;
  EXCEPTION
    WHEN OTHERS THEN
      DECLARE
        l_msg VARCHAR2(1000) := SUBSTRB(SQLERRM, 1, 1000);
        l_cod NUMBER := SQLCODE;
      BEGIN
        IF l_cod <> -20001 THEN
          registrar_corte(l_msg);
        END IF;
        RAISE_APPLICATION_ERROR(-20002, 'Backup: ' || l_msg);
      END;
  END ejecutar;

  PROCEDURE continuar(p_id IN NUMBER) IS
    l_enviado CHAR(1);
    l_inicio  DATE;
  BEGIN
    g_cpu0 := DBMS_UTILITY.GET_CPU_TIME;
    g_log  := p_id;
    SELECT enviado, inicio, NVL(partes, 0), NVL(tablas, 0), NVL(filas, 0),
           NVL(bytes_script, 0), NVL(bytes_zip, 0), NVL(errores, 0), detalle
      INTO l_enviado, l_inicio, g_n, g_tablas, g_filas, g_b_sql, g_b_zip, g_errores, g_detalle
      FROM proy_backup_log
     WHERE id = p_id;
    g_enviar := l_enviado = 'S';
    g_fecha  := TO_CHAR(l_inicio, 'YYYY-MM-DD');
    leer_config;
    tramo;
  EXCEPTION
    WHEN OTHERS THEN
      DECLARE
        l_msg VARCHAR2(1000) := SUBSTRB(SQLERRM, 1, 1000);
      BEGIN
        registrar_corte(l_msg);
        RAISE_APPLICATION_ERROR(-20002, 'Backup: ' || l_msg);
      END;
  END continuar;

  PROCEDURE lanzar(p_enviar IN BOOLEAN DEFAULT TRUE) IS
    l_corriendo PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO l_corriendo FROM user_scheduler_jobs
     WHERE state IN ('SCHEDULED', 'RUNNING')
       AND (job_name LIKE 'BACKUP_MANUAL%' OR job_name LIKE 'BACKUP_TRAMO%')
        OR (job_name = 'JOB_BACKUP_PROY' AND state = 'RUNNING');
    IF l_corriendo > 0 THEN
      RAISE_APPLICATION_ERROR(-20004, 'Ya hay una copia corriendo: ver USER_SCHEDULER_JOBS.');
    END IF;
    DBMS_SCHEDULER.CREATE_JOB(
      job_name   => DBMS_SCHEDULER.GENERATE_JOB_NAME('BACKUP_MANUAL_'),
      job_type   => 'PLSQL_BLOCK',
      job_action => 'BEGIN PKG_BACKUP_PROY.ejecutar(p_enviar => '
                    || CASE WHEN p_enviar THEN 'TRUE' ELSE 'FALSE' END
                    || '); END;',
      start_date => SYSTIMESTAMP,
      enabled    => TRUE,
      auto_drop  => TRUE);
    DBMS_OUTPUT.PUT_LINE('[OK] Corriendo en segundo plano. Ver: '
                         || 'SELECT * FROM proy_backup_log ORDER BY id DESC');
  END lanzar;

  PROCEDURE fijar_destino(p_correo IN VARCHAR2, p_remitente IN VARCHAR2 DEFAULT NULL) IS
    PROCEDURE guardar(p_clave IN VARCHAR2, p_valor IN VARCHAR2) IS
    BEGIN
      MERGE INTO proy_backup_config t
      USING (SELECT p_clave AS clave, p_valor AS valor FROM dual) s
         ON (t.clave = s.clave)
       WHEN MATCHED THEN UPDATE SET t.valor = s.valor
       WHEN NOT MATCHED THEN INSERT (clave, valor) VALUES (s.clave, s.valor);
    END guardar;
  BEGIN
    IF NOT REGEXP_LIKE(TRIM(p_correo), '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
      RAISE_APPLICATION_ERROR(-20003, 'Esa casilla no parece válida.');
    END IF;
    guardar('DESTINO', TRIM(p_correo));
    guardar('REMITENTE', NVL(TRIM(p_remitente), TRIM(p_correo)));
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('[OK] Casilla guardada.');
  END fijar_destino;

  PROCEDURE probar_correo IS
    l_zip BLOB;
    l_bin BLOB;
    l_do  INTEGER := 1;
    l_so  INTEGER := 1;
    l_ctx INTEGER := DBMS_LOB.DEFAULT_LANG_CTX;
    l_w   INTEGER;
    l_txt CLOB := TO_CLOB('-- Prueba del backup de PROY: si lo podés abrir, el adjunto llegó bien.');
  BEGIN
    g_destino := config('DESTINO');
    g_desde   := config('REMITENTE', g_destino);
    IF g_destino IS NULL THEN
      DBMS_OUTPUT.PUT_LINE('[ERROR] Falta la casilla: PKG_BACKUP_PROY.fijar_destino.');
      RETURN;
    END IF;
    DBMS_LOB.CREATETEMPORARY(l_bin, TRUE, DBMS_LOB.SESSION);
    DBMS_LOB.CONVERTTOBLOB(l_bin, l_txt, DBMS_LOB.LOBMAXSIZE, l_do, l_so,
                           NLS_CHARSET_ID('AL32UTF8'), l_ctx, l_w);
    APEX_ZIP.ADD_FILE(p_zipped_blob => l_zip, p_file_name => 'prueba.sql', p_content => l_bin);
    APEX_ZIP.FINISH(p_zipped_blob => l_zip);
    enviar('Prueba del backup de PROY',
           'Si llegó este correo con prueba.zip adjunto, el backup puede enviarse.',
           l_zip, 'prueba.zip');
    empujar_cola;
    DBMS_OUTPUT.PUT_LINE('[OK] Correo en cola. Si no llega en unos minutos, mirar APEX_MAIL_QUEUE y APEX_MAIL_LOG.');
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('[ERROR] No se pudo mandar: ' || SQLERRM);
  END probar_correo;

END PKG_BACKUP_PROY;
/

-- El job de la madrugada. La hora se calcula en la zona de start_date, no en la del servidor.
BEGIN
  BEGIN
    DBMS_SCHEDULER.DROP_JOB('JOB_BACKUP_PROY', force => TRUE);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'JOB_BACKUP_PROY',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN PKG_BACKUP_PROY.ejecutar; END;',
    start_date      => TO_TIMESTAMP_TZ(TO_CHAR(SYSTIMESTAMP AT TIME ZONE '-03:00', 'YYYY-MM-DD')
                                       || ' 03:00:00 -03:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'),
    repeat_interval => 'FREQ=DAILY;BYHOUR=3;BYMINUTE=0;BYSECOND=0',
    enabled         => TRUE,
    auto_drop       => FALSE,
    comments        => 'Backup completo por correo. Ver backend/backup.sql');
END;
/
```
