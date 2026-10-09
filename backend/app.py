from flask import Flask, request, jsonify
from flask_cors import CORS
import pymysql
from auth import hash_senha, verificar_senha, gerar_token, token_required
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)  # Libera o acesso para o Frontend (HTML/CSS/JS)

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'root',
    'database': 'deposito_construcao',
    'port': 3306,
    'cursorclass': pymysql.cursors.DictCursor
}

def get_db_connection():
    return pymysql.connect(**DB_CONFIG)

# --- 1. AUTENTICAÇÃO  ---
@app.route('/api/login', methods=['POST'])
def login():
    dados = request.get_json()
    # Aceita tanto a chave 'login' quanto 'email' enviada pelo front-end
    identificador = dados.get('login') or dados.get('email')
    senha = dados.get('senha')

    if not identificador or not senha:
        return jsonify({'mensagem': 'Login/Email e senha são obrigatórios!'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Procura tanto na coluna 'login' quanto na coluna 'email'
            cursor.execute("SELECT * FROM usuarios WHERE login = %s OR email = %s", (identificador, identificador))
            usuario = cursor.fetchone()

            if usuario and verificar_senha(senha, usuario['senha_hash']):
                token = gerar_token(usuario['id'], usuario['perfil'])
                return jsonify({
                    'mensagem': 'Login realizado com sucesso!',
                    'token': token,
                    'usuario': {
                        'id': usuario['id'],
                        'nome': usuario['nome'],
                        'perfil': usuario['perfil']
                    }
                }), 200
            else:
                return jsonify({'mensagem': 'Credenciais inválidas!'}), 401
    finally:
        conn.close()

# --- 2. CLIENTES  ---
@app.route('/api/clientes', methods=['GET'])
@token_required
def listar_clientes(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM clientes WHERE ativo = TRUE ORDER BY nome_razao_social")
            clientes = cursor.fetchall()
            return jsonify(clientes), 200
    finally:
        conn.close()

@app.route('/api/clientes', methods=['POST'])
@token_required
def cadastrar_cliente(current_user):
    dados = request.get_json()
    nome = dados.get('nome_razao_social')
    cpf_cnpj = dados.get('cpf_cnpj')
    telefone = dados.get('telefone')
    email = dados.get('email')
    endereco = dados.get('endereco')
    tipo_pessoa = dados.get('tipo_pessoa', 'PF')

    if not nome:
        return jsonify({'mensagem': 'Nome/Razão Social é obrigatório!'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """INSERT INTO clientes (tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, email, endereco) 
                     VALUES (%s, %s, %s, %s, %s, %s)"""
            cursor.execute(sql, (tipo_pessoa, nome, cpf_cnpj, telefone, email, endereco))
            conn.commit()
            return jsonify({'mensagem': 'Cliente cadastrado com sucesso!'}), 201
    except pymysql.MySQLError as e:
        return jsonify({'mensagem': 'Erro ao cadastrar cliente (CPF/CNPJ pode estar duplicado).', 'erro': str(e)}), 400
    finally:
        conn.close()

# --- 3. PRODUTOS E ESTOQUE  ---
@app.route('/api/produtos', methods=['GET'])
@token_required
def listar_produtos(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM produtos ORDER BY nome")
            produtos = cursor.fetchall()
            return jsonify(produtos), 200
    finally:
        conn.close()

@app.route('/api/produtos', methods=['POST'])
@token_required
def cadastrar_produto(current_user):
    dados = request.get_json()
    nome = dados.get('nome')
    categoria = dados.get('categoria')
    unidade = dados.get('unidade_medida')
    preco = dados.get('preco_venda')
    estoque = dados.get('estoque_atual', 0)
    estoque_min = dados.get('estoque_minimo', 5)

    if not nome or not categoria or not unidade or preco is None:
        return jsonify({'mensagem': 'Campos obrigatórios ausentes!'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """INSERT INTO produtos (nome, categoria, unidade_medida, preco_venda, estoque_atual, estoque_minimo) 
                     VALUES (%s, %s, %s, %s, %s, %s)"""
            cursor.execute(sql, (nome, categoria, unidade, preco, estoque, estoque_min))
            conn.commit()
            return jsonify({'mensagem': 'Produto cadastrado com sucesso!'}), 201
    finally:
        conn.close()

@app.route('/api/produtos/alerta-estoque', methods=['GET'])
@token_required
def alerta_estoque(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM produtos WHERE estoque_atual <= estoque_minimo ORDER BY estoque_atual ASC")
            alertas = cursor.fetchall()
            return jsonify(alertas), 200
    finally:
        conn.close()

# --- 4. VENDAS E TRANSAÇÃO  ---
@app.route('/api/vendas', methods=['GET'])
@token_required
def listar_vendas(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
            SELECT v.id, v.data_venda, v.valor_total, v.forma_pagamento, v.status,
                   c.nome_razao_social AS cliente_nome, u.nome AS usuario_nome
            FROM vendas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            JOIN usuarios u ON v.usuario_id = u.id
            ORDER BY v.data_venda DESC
            """
            cursor.execute(sql)
            vendas = cursor.fetchall()
            return jsonify(vendas), 200
    finally:
        conn.close()

@app.route('/api/vendas', methods=['POST'])
@token_required
def criar_venda(usuario_atual):
    dados = request.json or {}
    
    #  Permite atribuir um vendedor específico enviado pelo front-end, senão usa o usuário logado
    user_id = dados.get('usuario_id') or dados.get('vendedor_id')
    if not user_id:
        if isinstance(usuario_atual, dict):
            user_id = usuario_atual.get('id') or usuario_atual.get('user_id') or usuario_atual.get('sub')
        elif isinstance(usuario_atual, (int, str)) and str(usuario_atual).isdigit():
            user_id = int(usuario_atual)

    # Fallback de segurança
    if not user_id:
        conn_temp = get_db_connection()
        try:
            with conn_temp.cursor() as cur:
                cur.execute("SELECT id FROM usuarios LIMIT 1")
                res = cur.fetchone()
                if res:
                    user_id = res['id'] if isinstance(res, dict) else res[0]
        except Exception:
            pass
        finally:
            conn_temp.close()

    if not user_id:
        user_id = 1

    cliente_id = dados.get('cliente_id')
    cliente_id = int(cliente_id) if cliente_id else None
    
    motorista_id = dados.get('motorista_id')
    motorista_id = int(motorista_id) if motorista_id else None
    
    forma_pagamento = dados.get('forma_pagamento', 'Dinheiro')
    itens = dados.get('itens', [])

    if not itens:
        return jsonify({'mensagem': 'O carrinho está vazio!'}), 400

    conn = get_db_connection() 
    cursor = conn.cursor()

    try:
        conn.begin()

        valor_total = 0.0
        itens_processados = []

        for item in itens:
            prod_id = int(item.get('produto_id') or item.get('id'))
            qtd = float(item.get('quantidade', 1))
            
            preco_un = float(item.get('preco_unitario') or item.get('preco') or 0.0)
            sub = float(item.get('subtotal') or (qtd * preco_un))
            
            if preco_un == 0 and sub > 0 and qtd > 0:
                preco_un = sub / qtd

            valor_total += sub
            itens_processados.append({
                'produto_id': prod_id,
                'quantidade': qtd,
                'preco_unitario': preco_un,
                'subtotal': sub
            })

        sql_venda = """
            INSERT INTO vendas (cliente_id, usuario_id, motorista_id, valor_total, forma_pagamento, status)
            VALUES (%s, %s, %s, %s, %s, 'Concluída')
        """
        cursor.execute(sql_venda, (cliente_id, user_id, motorista_id, valor_total, forma_pagamento))
        venda_id = cursor.lastrowid

        sql_item = """
            INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
            VALUES (%s, %s, %s, %s, %s)
        """
        sql_estoque = """
            UPDATE produtos 
            SET estoque_atual = estoque_atual - %s 
            WHERE id = %s
        """

        for item in itens_processados:
            cursor.execute(sql_item, (venda_id, item['produto_id'], item['quantidade'], item['preco_unitario'], item['subtotal']))
            cursor.execute(sql_estoque, (item['quantidade'], item['produto_id']))

        conn.commit()
        return jsonify({'mensagem': 'Venda realizada com sucesso!', 'venda_id': venda_id}), 201

    except Exception as e:
        conn.rollback()
        print(f"Erro detalhado ao realizar venda: {e}")
        return jsonify({'mensagem': 'Erro ao realizar venda.', 'erro': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/vendas/<int:venda_id>', methods=['PUT'])
@token_required
def editar_venda(current_user, venda_id):
    dados = request.get_json(silent=True) or {}
    itens = dados.get('itens', [])

    if not itens:
        return jsonify({'mensagem': 'A venda precisa conter pelo menos um item!'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conn.begin()

        # Verifica se a venda existe e pega o status atual
        cursor.execute("SELECT id, status FROM vendas WHERE id = %s FOR UPDATE", (venda_id,))
        venda_atual = cursor.fetchone()
        if not venda_atual:
            conn.rollback()
            return jsonify({'mensagem': 'Venda não encontrada.'}), 404

        if venda_atual.get('status') == 'Cancelada':
            conn.rollback()
            return jsonify({'mensagem': 'Não é possível editar uma venda cancelada.'}), 400

        #  Estorna o estoque dos itens antigos para evitar furos no estoque
        cursor.execute("SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = %s", (venda_id,))
        itens_antigos = cursor.fetchall()
        for item in itens_antigos:
            cursor.execute(
                "UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s",
                (item['quantidade'], item['produto_id'])
            )

        #  Remove os itens antigos
        cursor.execute("DELETE FROM itens_venda WHERE venda_id = %s", (venda_id,))

        #  Processa os novos itens e calcula o valor total
        valor_total = 0.0
        itens_processados = []

        for item in itens:
            prod_id = int(item.get('produto_id') or item.get('id'))
            qtd = float(item.get('quantidade', 1))
            preco_un = float(item.get('preco_unitario') or item.get('preco') or 0.0)
            sub = float(item.get('subtotal') or (qtd * preco_un))

            if preco_un == 0 and sub > 0 and qtd > 0:
                preco_un = sub / qtd

            valor_total += sub
            itens_processados.append({
                'produto_id': prod_id,
                'quantidade': qtd,
                'preco_unitario': preco_un,
                'subtotal': sub
            })

        #  Define cliente, motorista e vendedor/usuário responsável
        cliente_id = dados.get('cliente_id')
        cliente_id = int(cliente_id) if cliente_id else None

        motorista_id = dados.get('motorista_id') or dados.get('funcionario_id')
        motorista_id = int(motorista_id) if motorista_id else None

        vendedor_id = dados.get('usuario_id') or dados.get('vendedor_id')
        if not vendedor_id:
            if isinstance(current_user, dict):
                vendedor_id = current_user.get('id')
            else:
                vendedor_id = current_user

        forma_pagamento = dados.get('forma_pagamento', 'Dinheiro')

        #  Atualiza a venda principal
        sql_update = """
            UPDATE vendas 
            SET cliente_id = %s, motorista_id = %s, usuario_id = %s, 
                valor_total = %s, forma_pagamento = %s
            WHERE id = %s
        """
        cursor.execute(sql_update, (cliente_id, motorista_id, vendedor_id, valor_total, forma_pagamento, venda_id))

        #  Insere os novos itens e desconta o estoque atualizado
        sql_item = """
            INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
            VALUES (%s, %s, %s, %s, %s)
        """
        sql_estoque = """
            UPDATE produtos 
            SET estoque_atual = estoque_atual - %s 
            WHERE id = %s
        """

        for item in itens_processados:
            cursor.execute(sql_item, (venda_id, item['produto_id'], item['quantidade'], item['preco_unitario'], item['subtotal']))
            cursor.execute(sql_estoque, (item['quantidade'], item['produto_id']))

        conn.commit()
        return jsonify({'mensagem': 'Venda atualizada com sucesso!'}), 200

    except Exception as e:
        conn.rollback()
        print(f"Erro ao editar venda: {e}")
        return jsonify({'mensagem': 'Erro ao atualizar venda', 'erro': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/vendas/<int:venda_id>/cancelar', methods=['POST'])
@token_required
def cancelar_venda(current_user, venda_id):
    conn = get_db_connection()
    try:
        conn.begin()
        with conn.cursor() as cursor:
            cursor.execute("SELECT status FROM vendas WHERE id = %s FOR UPDATE", (venda_id,))
            venda = cursor.fetchone()

            if not venda:
                conn.rollback()
                return jsonify({'mensagem': 'Venda não encontrada!'}), 404

            if venda['status'] == 'Cancelada':
                conn.rollback()
                return jsonify({'mensagem': 'Venda já está cancelada!'}), 400

            
            cursor.execute("SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = %s", (venda_id,))
            itens = cursor.fetchall()

            for item in itens:
                cursor.execute("UPDATE produtos SET estoque_atual = estoque_atual + %s WHERE id = %s", 
                               (item['quantidade'], item['produto_id']))

            cursor.execute("UPDATE vendas SET status = 'Cancelada' WHERE id = %s", (venda_id,))

        conn.commit()
        return jsonify({'mensagem': 'Venda cancelada e estoque estornado com sucesso!'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'mensagem': 'Erro ao cancelar a venda.', 'erro': str(e)}), 500
    finally:
        conn.close()

# --- 5. RELATÓRIOS (RF09) ---
@app.route('/api/relatorios/resumo', methods=['GET'])
@token_required
def relatorio_resumo(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Total faturado (Vendas Concluídas)
            cursor.execute("SELECT SUM(valor_total) AS total_faturado FROM vendas WHERE status = 'Concluída'")
            total_faturado = cursor.fetchone()['total_faturado'] or 0.00

            # Produtos mais vendidos
            sql_top = """
            SELECT p.nome, SUM(iv.quantidade) AS total_vendido
            FROM itens_venda iv
            JOIN vendas v ON iv.venda_id = v.id
            JOIN produtos p ON iv.produto_id = p.id
            WHERE v.status = 'Concluída'
            GROUP BY p.id, p.nome
            ORDER BY total_vendido DESC LIMIT 5
            """
            cursor.execute(sql_top)
            top_produtos = cursor.fetchall()

            return jsonify({
                'total_faturado': float(total_faturado),
                'top_produtos': top_produtos
            }), 200
    finally:
        conn.close()

@app.route('/api/vendas/<int:venda_id>', methods=['GET'])
@token_required
def obter_detalhes_venda(current_user, venda_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql_venda = """
            SELECT v.*, 
                   c.nome_razao_social AS cliente_nome, 
                   c.cpf_cnpj, 
                   c.endereco AS cliente_endereco, 
                   u.nome AS usuario_nome,
                   m.nome AS motorista_nome
            FROM vendas v
            LEFT JOIN clientes c ON v.cliente_id = c.id
            JOIN usuarios u ON v.usuario_id = u.id
            LEFT JOIN funcionarios m ON v.motorista_id = m.id
            WHERE v.id = %s
            """
            cursor.execute(sql_venda, (venda_id,))
            venda = cursor.fetchone()

            if not venda:
                return jsonify({'mensagem': 'Venda não encontrada!'}), 404

            sql_itens = """
            SELECT iv.*, p.nome AS produto_nome, p.unidade_medida
            FROM itens_venda iv
            JOIN produtos p ON iv.produto_id = p.id
            WHERE iv.venda_id = %s
            """
            cursor.execute(sql_itens, (venda_id,))
            itens = cursor.fetchall()

            return jsonify({'venda': venda, 'itens': itens}), 200
    finally:
        conn.close()

# --- HISTÓRICO DE COMPRAS DO CLIENTE ---
@app.route('/api/clientes/<int:cliente_id>/vendas', methods=['GET'])
@token_required
def historico_compras_cliente(current_user, cliente_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
            SELECT id, data_venda, valor_total, forma_pagamento, status
            FROM vendas
            WHERE cliente_id = %s
            ORDER BY data_venda DESC
            """
            cursor.execute(sql, (cliente_id,))
            vendas = cursor.fetchall()
            return jsonify(vendas), 200
    finally:
        conn.close()

# --- EDIÇÃO E DESATIVAÇÃO DE CLIENTES ---
@app.route('/api/clientes/<int:cliente_id>', methods=['PUT'])
@token_required
def editar_cliente(current_user, cliente_id):
    dados = request.get_json()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """UPDATE clientes 
                     SET nome_razao_social=%s, cpf_cnpj=%s, telefone=%s, email=%s, endereco=%s 
                     WHERE id=%s"""
            cursor.execute(sql, (
                dados.get('nome_razao_social'),
                dados.get('cpf_cnpj') or None,
                dados.get('telefone') or None,
                dados.get('email') or None,
                dados.get('endereco') or None,
                cliente_id
            ))
            conn.commit()
            return jsonify({'mensagem': 'Cliente atualizado com sucesso!'}), 200
    finally:
        conn.close()

@app.route('/api/clientes/<int:cliente_id>', methods=['DELETE'])
@token_required
def desativar_cliente(current_user, cliente_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE clientes SET ativo = FALSE WHERE id = %s", (cliente_id,))
            conn.commit()
            return jsonify({'mensagem': 'Cliente desativado com sucesso!'}), 200
    finally:
        conn.close()

# --- EDIÇÃO E DESATIVAÇÃO DE PRODUTOS ---
@app.route('/api/produtos/<int:produto_id>', methods=['PUT'])
@token_required
def editar_produto(current_user, produto_id):
    dados = request.get_json()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """UPDATE produtos 
                     SET nome=%s, categoria=%s, unidade_medida=%s, preco_venda=%s, estoque_atual=%s, estoque_minimo=%s 
                     WHERE id=%s"""
            cursor.execute(sql, (
                dados.get('nome'),
                dados.get('categoria'),
                dados.get('unidade_medida'),
                dados.get('preco_venda'),
                dados.get('estoque_atual'),
                dados.get('estoque_minimo'),
                produto_id
            ))
            conn.commit()
            return jsonify({'mensagem': 'Produto atualizado com sucesso!'}), 200
    finally:
        conn.close()

@app.route('/api/produtos/<int:produto_id>', methods=['DELETE'])
@token_required
def desativar_produto(current_user, produto_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM produtos WHERE id = %s", (produto_id,))
            conn.commit()
            return jsonify({'mensagem': 'Produto removido com sucesso!'}), 200
    except Exception:
        # Se o produto já foi vendido, apenas zera o estoque para não quebrar o histórico
        with conn.cursor() as cursor:
            cursor.execute("UPDATE produtos SET estoque_atual = 0 WHERE id = %s", (produto_id,))
            conn.commit()
            return jsonify({'mensagem': 'Produto associado a vendas existentes. Estoque zerado.'}), 200
    finally:
        conn.close()

        # --- ROTAS DE FUNCIONÁRIOS ---
@app.route('/api/funcionarios', methods=['GET'])
@token_required
def listar_funcionarios(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM funcionarios WHERE ativo = TRUE")
            funcionarios = cursor.fetchall()
            return jsonify(funcionarios), 200
    finally:
        conn.close()

@app.route('/api/funcionarios', methods=['POST'])
@token_required
def criar_funcionario(current_user):
    dados = request.get_json()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "INSERT INTO funcionarios (nome, cargo, cpf, telefone) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, (
                dados.get('nome'),
                dados.get('cargo'),
                dados.get('cpf') or None,
                dados.get('telefone') or None
            ))
            conn.commit()
            return jsonify({'mensagem': 'Funcionário cadastrado com sucesso!'}), 201
    finally:
        conn.close()

@app.route('/api/funcionarios/<int:func_id>', methods=['PUT'])
@token_required
def editar_funcionario(current_user, func_id):
    dados = request.get_json()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "UPDATE funcionarios SET nome=%s, cargo=%s, cpf=%s, telefone=%s WHERE id=%s"
            cursor.execute(sql, (
                dados.get('nome'),
                dados.get('cargo'),
                dados.get('cpf') or None,
                dados.get('telefone') or None,
                func_id
            ))
            conn.commit()
            return jsonify({'mensagem': 'Funcionário atualizado!'}), 200
    finally:
        conn.close()

@app.route('/api/funcionarios/<int:func_id>', methods=['DELETE'])
@token_required
def desativar_funcionario(current_user, func_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE funcionarios SET ativo = FALSE WHERE id = %s", (func_id,))
            conn.commit()
            return jsonify({'mensagem': 'Funcionário desativado!'}), 200
    finally:
        conn.close()

@app.route('/api/usuarios', methods=['GET'])
@token_required
def listar_usuarios(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, nome, perfil FROM usuarios")
            usuarios = cursor.fetchall()
            return jsonify(usuarios), 200
    finally:
        conn.close()

@app.route('/api/funcionarios/<int:id>/criar-login', methods=['POST'])
@token_required
def criar_login_funcionario(usuario_atual, id):
    dados = request.json
    login = dados.get('login')
    senha_plana = dados.get('senha')
    perfil = dados.get('perfil', 'Vendedor')

    if not login or not senha_plana:
        return jsonify({'mensagem': 'Login e senha são obrigatórios'}), 400

   
    senha_criptografada = generate_password_hash(senha_plana) 

    conn = get_db_connection()
    
    cursor = conn.cursor() 

    try:
        sql = """
            INSERT INTO usuarios (nome, login, senha_hash, perfil, funcionario_id)
            SELECT nome, %s, %s, %s, id 
            FROM funcionarios 
            WHERE id = %s
        """
        cursor.execute(sql, (login, senha_criptografada, perfil, id))
        conn.commit()
        return jsonify({'mensagem': 'Login criado com sucesso para o funcionário!'}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'mensagem': 'Erro ao criar login. O login já existe?', 'erro': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

        # ---  MARCAS  ---
@app.route('/api/marcas', methods=['GET'])
@token_required
def listar_marcas(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM marcas ORDER BY nome")
            return jsonify(cursor.fetchall()), 200
    finally:
        conn.close()

@app.route('/api/marcas', methods=['POST'])
@token_required
def cadastrar_marca(current_user):
    dados = request.get_json()
    nome = dados.get('nome')
    if not nome:
        return jsonify({'mensagem': 'O nome da marca é obrigatório!'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "INSERT INTO marcas (nome, cnpj, telefone, endereco) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, (nome, dados.get('cnpj'), dados.get('telefone'), dados.get('endereco')))
            conn.commit()
            return jsonify({'mensagem': 'Marca cadastrada com sucesso!'}), 201
    finally:
        conn.close()

@app.route('/api/marcas/<int:id>', methods=['PUT'])
@token_required
def editar_marca(current_user, id):
    dados = request.get_json()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "UPDATE marcas SET nome=%s, cnpj=%s, telefone=%s, endereco=%s WHERE id=%s"
            cursor.execute(sql, (dados.get('nome'), dados.get('cnpj'), dados.get('telefone'), dados.get('endereco'), id))
            conn.commit()
            return jsonify({'mensagem': 'Marca atualizada com sucesso!'}), 200
    finally:
        conn.close()

    # --- FORNECEDORES ---
@app.route('/api/fornecedores', methods=['GET'])
@token_required
def listar_fornecedores(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, nome_razao_social, cnpj, telefone, contato
                FROM fornecedores
                ORDER BY nome_razao_social
            """)
            return jsonify(cursor.fetchall()), 200
    finally:
        conn.close()

@app.route('/api/fornecedores', methods=['POST'])
@token_required
def cadastrar_fornecedor(current_user):
    dados = request.get_json()
    nome = dados.get('nome_razao_social')
    cnpj = dados.get('cnpj')
    if not nome or not cnpj:
        return jsonify({'mensagem': 'Nome/razão social e CNPJ são obrigatórios!'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "INSERT INTO fornecedores (nome_razao_social, cnpj, telefone, contato) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, (nome, cnpj, dados.get('telefone'), dados.get('contato')))
            conn.commit()
            return jsonify({'mensagem': 'Fornecedor cadastrado com sucesso!'}), 201
    except pymysql.err.IntegrityError:
        return jsonify({'mensagem': 'Já existe um fornecedor cadastrado com esse CNPJ.'}), 400
    finally:
        conn.close()

@app.route('/api/fornecedores/<int:id>', methods=['PUT'])
@token_required
def editar_fornecedor(current_user, id):
    dados = request.get_json()
    nome = dados.get('nome_razao_social')
    cnpj = dados.get('cnpj')
    if not nome or not cnpj:
        return jsonify({'mensagem': 'Nome/razão social e CNPJ são obrigatórios!'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "UPDATE fornecedores SET nome_razao_social=%s, cnpj=%s, telefone=%s, contato=%s WHERE id=%s"
            cursor.execute(sql, (nome, cnpj, dados.get('telefone'), dados.get('contato'), id))
            conn.commit()
            return jsonify({'mensagem': 'Fornecedor atualizado com sucesso!'}), 200
    except pymysql.err.IntegrityError:
        return jsonify({'mensagem': 'Já existe um fornecedor cadastrado com esse CNPJ.'}), 400
    finally:
        conn.close()    

if __name__ == '__main__':
    app.run(debug=True, port=5000)