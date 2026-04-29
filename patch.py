import pathlib

f = pathlib.Path('frontend/app/src/ui/AppCore.tsx')
c = f.read_text(encoding='utf-8')

old_catch = """    } catch (err) {
      alert("ERROR: Credenciales inválidas.");
    }"""

new_catch = """    } catch (err: any) {
      if (err.message && ('fetch' in err.message or 'Network' in err.message)) {
        setIsOffline(true);
        alert("ALERTA: Servidor SOC no alcanzable. MODO OFFLINE ACTIVADO.");
      } else {
        alert("ERROR: Credenciales inválidas.");
      }
    }"""

old_auth = """.catch((err) => {
         console.error("Token invalid, showing login:", err);"""

new_auth = """.catch((err: any) => {
         if (err.message && ('fetch' in err.message or 'Network' in err.message)) {
           setIsOffline(true);
           setLoading(false);
           return;
         }
         console.error("Token invalid, showing login:", err);"""

c = c.replace(old_catch, new_catch)
c = c.replace(old_auth, new_auth)
f.write_text(c, encoding='utf-8')
