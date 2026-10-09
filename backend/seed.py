import pymysql
from auth import hash_senha

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',
    'database': 'deposito_construcao',
    'port': 3306
}

def seed_admin():
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()

    email_admin = "admin@deposito.com"
    senha_hash = hash_senha("admin123")

    sql = """
    INSERT INTO usuarios (nome, email, senha_hash, perfil)
    VALUES (%s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE email=email;
    """
    cursor.execute(sql, ("Administrador", email_admin, senha_hash, "Administrador"))
    conn.commit()
    conn.close()
    print("Usuário Admin registrado com sucesso! (Email: admin@deposito.com | Senha: admin123)")

if __name__ == '__main__':
    seed_admin()