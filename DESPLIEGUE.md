# Despliegue en un VPS (Hostinger, Ubuntu 24.04)

Guía paso a paso para dejar el sistema andando en un VPS con Ubuntu 24.04
LTS: panel de gestión y web pública en un solo dominio, con HTTPS.

Los comandos se copian y pegan tal cual. Donde dice `TU_DOMINIO` (por
ejemplo `elatelier.com.ar`, sin `https://` ni `www`) o `IP_DEL_VPS`, hay
que reemplazarlo por el valor real.

**Antes de empezar, tener a mano:**

- La **IP del VPS** y la **contraseña de root** (hPanel → VPS → Resumen).
- El **dominio** ya comprado.
- Si el repositorio de GitHub es privado: un **token de acceso** de GitHub
  (GitHub → Settings → Developer settings → Personal access tokens →
  Fine-grained, con permiso de lectura sobre este repo).

---

## 1. Conectarse al servidor

Desde PowerShell en tu PC:

```bash
ssh root@IP_DEL_VPS
```

La primera vez pregunta si confiás en el servidor: escribir `yes`. Después
pide la contraseña de root (al tipearla no se ve nada, es normal).

También se puede usar la terminal del navegador que ofrece hPanel
(VPS → Terminal del navegador).

## 2. Actualizar el sistema e instalar lo necesario

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs build-essential git nginx postgresql certbot python3-certbot-nginx
npm install -g pm2
```

Verificar: `node -v` tiene que mostrar `v22.x`.

## 3. Firewall

Solo quedan abiertos SSH (22), HTTP (80) y HTTPS (443). PostgreSQL **no**
se abre a internet.

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

(Pregunta si continuar: `y`.)

## 4. Usuario para la aplicación

La app no corre como root. Se crea un usuario `atelier`:

```bash
adduser atelier
```

Pide una contraseña (anotarla) y datos opcionales (Enter para saltearlos).

## 5. Base de datos

Generar una contraseña para la base y **anotarla**:

```bash
openssl rand -hex 24
```

Crear el usuario y la base (reemplazar `CLAVE_DB` por la contraseña recién
generada):

```bash
sudo -u postgres psql -c "CREATE USER atelier WITH PASSWORD 'CLAVE_DB';"
sudo -u postgres createdb -O atelier atelier_herreria
```

## 6. Bajar el proyecto

Pasar al usuario `atelier` y clonar el repo:

```bash
su - atelier
git clone https://github.com/Aliaga-Felipe/Sistema-herreria.git app
cd app
```

Si el repo es privado, cuando pida usuario va el usuario de GitHub y como
contraseña se pega el **token** (no la contraseña de GitHub).

## 7. Archivo `.env`

Generar el secreto para los inicios de sesión y **copiarlo**:

```bash
openssl rand -hex 48
```

Crear el `.env` y editarlo:

```bash
cp .env.example .env
nano .env
```

Valores a completar:

```
PORT=3001
DATABASE_URL=postgresql://atelier:CLAVE_DB@localhost:5432/atelier_herreria
DATABASE_SSL=false
JWT_SECRET=<el secreto generado recién>
CLIENT_URL=https://TU_DOMINIO
PUBLIC_BASE_URL=https://TU_DOMINIO
WHATSAPP_SYNC_ENABLED=false
```

Más los datos SMTP para el formulario de Contacto (ver comentarios en el
mismo archivo). La integración con WhatsApp se activa después, cuando se
tengan los datos de Meta (ver [INTEGRACION_WHATSAPP.md](INTEGRACION_WHATSAPP.md)).

En `nano`: guardar con `Ctrl+O` y Enter, salir con `Ctrl+X`.

## 8. Instalar, compilar y preparar la base

```bash
npm ci
npm run build
node server/scripts/aplicar-schema.js
node server/scripts/crear-admin.js
```

El último comando pide nombre, correo y contraseña del primer
administrador. Si hace falta el rol `super_admin`:

```bash
node server/scripts/configurar-super-admin.js
```

## 9. Dejar la app corriendo siempre (PM2)

```bash
NODE_ENV=production pm2 start server/index.js --name atelier
pm2 save
pm2 startup
```

`pm2 startup` imprime un comando que empieza con `sudo env PATH=...`.
Salir del usuario `atelier` con `exit` (volvés a root), pegar ese comando
**sin el `sudo` del principio** y ejecutarlo. Así la app arranca sola si se
reinicia el servidor.

Probar que responde (como root o como atelier):

```bash
curl http://localhost:3001/api/publico/productos
```

Tiene que devolver algo como `{"productos":[],...}`.

## 10. Nginx (el dominio apunta a la app)

Como root:

```bash
nano /etc/nginx/sites-available/atelier
```

Pegar esto (reemplazando `TU_DOMINIO` en las dos apariciones):

```nginx
server {
    listen 80;
    server_name TU_DOMINIO www.TU_DOMINIO;

    # El video de la portada puede pesar hasta 40 MB.
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activarlo:

```bash
ln -s /etc/nginx/sites-available/atelier /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

`nginx -t` tiene que decir `syntax is ok` y `test is successful`.

## 11. Apuntar el dominio al VPS

En el panel donde está el dominio (si es Hostinger: hPanel → Dominios →
DNS / Nameservers), crear o editar dos registros:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | `@` | IP_DEL_VPS |
| A | `www` | IP_DEL_VPS |

Borrar cualquier otro registro A o AAAA de `@` y `www` que apunte a otro
lado. El cambio puede tardar de minutos a unas horas. Se puede verificar
desde PowerShell con `nslookup TU_DOMINIO`: tiene que devolver la IP del
VPS.

Con eso, `http://TU_DOMINIO` ya muestra el sitio.

## 12. HTTPS (candado)

Cuando el dominio ya apunta al VPS:

```bash
certbot --nginx -d TU_DOMINIO -d www.TU_DOMINIO
```

Pide un correo (para avisos de vencimiento) y aceptar los términos. El
certificado se renueva solo.

Listo: `https://TU_DOMINIO` es la web pública y `https://TU_DOMINIO/login`
el panel.

## 13. Respaldos de la base

Como usuario `atelier` (`su - atelier`):

```bash
mkdir -p ~/backups
crontab -e
```

(Si pregunta qué editor usar, elegir `nano`.) Agregar al final esta línea,
reemplazando `CLAVE_DB`:

```
0 3 * * * pg_dump "postgresql://atelier:CLAVE_DB@localhost:5432/atelier_herreria" | gzip > ~/backups/db-$(date +\%F).sql.gz && find ~/backups -name 'db-*.sql.gz' -mtime +14 -delete
```

Hace un respaldo por día a las 3 AM y guarda los últimos 14 días. Las
fotos (`~/app/server/uploads`) no están en GitHub: quedan cubiertas por los
snapshots del VPS (hPanel → VPS → Snapshots y copias de seguridad).
Conviene además bajar de vez en cuando una copia de `~/backups` a otra
computadora.

## 14. Seguridad extra (recomendado)

- **Llave SSH en vez de contraseña:** en tu PC, `ssh-keygen` (Enter a
  todo) y cargar el contenido de `C:\Users\<tu usuario>\.ssh\id_ed25519.pub`
  en hPanel → VPS → Configuración → Llaves SSH. Probar que `ssh
  root@IP_DEL_VPS` entra sin pedir contraseña **antes** de desactivar el
  acceso con contraseña (`PasswordAuthentication no` en
  `/etc/ssh/sshd_config` y `systemctl restart ssh`).
- **Actualizaciones de seguridad automáticas:** Ubuntu 24.04 las trae
  activadas. Verificar con `systemctl status unattended-upgrades`.

---

## Actualizar el sistema después de un cambio

Cada vez que se sube una versión nueva a GitHub:

```bash
su - atelier
cd app
git pull
npm ci
npm run build
node server/scripts/aplicar-schema.js
pm2 restart atelier
```

## Comandos útiles

| Para | Comando |
| --- | --- |
| Ver si la app está corriendo | `pm2 status` |
| Ver los últimos errores de la app | `pm2 logs atelier --lines 50` |
| Reiniciar la app (por ejemplo, después de cambiar `.env`) | `pm2 restart atelier` |
| Ver errores de Nginx | `tail -n 50 /var/log/nginx/error.log` |
| Espacio en disco | `df -h` |
