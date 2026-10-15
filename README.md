# Nexus

**Conexión operativa**

Base funcional de la APP de usuario. El Panel ADM se reserva para Wix.

## Arquitectura inicial

- APP funcional: GitHub.
- Identidad/sesión: estándar Wix/SYS.
- Contexto multiempresa: EO resuelta por SYS.
- Estado normalizado: CCA existente.
- Mensajería: MNS.
- Capacitación: Wix Programs.
- Monitor compacto: CH 00 usa exclusivamente la empresa y el miembro del contexto autenticado de SYS; CH 01–02 son señales digitales y CH 03+ se consultan en el catálogo público de SYS.
- Número de canal y título sobre la imagen; controles de sonido, Canales y ampliación. Indicador de carga y reconexión.
- El sondeo de CH 00 conserva el token de NEXUS y descarta respuestas de otro miembro o empresa, o de una sesión anterior.
- Pruebas: `node --test tests/*.test.*`.
- Administración: acceso restringido; Panel ADM en Wix.

Nexus consume los estándares globales SCaD y no debe duplicar USR, EO, MNS, autenticación, roles ni CCA.

**Versión:** v0.1.0
