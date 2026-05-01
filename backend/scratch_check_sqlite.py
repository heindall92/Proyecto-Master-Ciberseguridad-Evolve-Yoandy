import sqlite3
import os

db_path = r"e:\000Yoandy\Proyecto SOC\Valhalla-SOC\backend\valhalla.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT username FROM User")
        users = cursor.fetchall()
        print(f"SQLite Users: {users}")
    except Exception as e:
        print(f"Error reading SQLite: {e}")
    conn.close()
else:
    print("valhalla.db not found")
