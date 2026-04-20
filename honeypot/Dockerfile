# Valhalla SOC - Honeypot - Imagen Cowrie con permisos corregidos
#
# Extiende la imagen oficial cowrie/cowrie:latest para pre-crear los
# directorios de log/download/tty con ownership cowrie:cowrie. Sin
# esto, al montar un volumen nombrado vacio, Docker crea el punto de
# montaje como root y el proceso cowrie (UID 999) no puede escribir.
# Sintoma: el honeypot corre, pero no genera cowrie.json.

FROM cowrie/cowrie:latest

USER root

RUN mkdir -p /cowrie/cowrie-git/var/log/cowrie \
             /cowrie/cowrie-git/var/lib/cowrie/downloads \
             /cowrie/cowrie-git/var/lib/cowrie/tty \
 && chown -R cowrie:cowrie /cowrie/cowrie-git/var/log \
                           /cowrie/cowrie-git/var/lib/cowrie \
 && chmod -R u+rwX,g+rwX /cowrie/cowrie-git/var/log \
                         /cowrie/cowrie-git/var/lib/cowrie

USER cowrie
