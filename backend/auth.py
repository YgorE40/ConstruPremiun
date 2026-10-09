import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify

SECRET_KEY = "sua_chave_secreta_deposito"

def hash_senha(senha_plana: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(senha_plana.encode('utf-8'), salt).decode('utf-8')

def verificar_senha(senha_plana: str, senha_hashed: str) -> bool:
    return bcrypt.checkpw(senha_plana.encode('utf-8'), senha_hashed.encode('utf-8'))

def gerar_token(usuario_id: int, perfil: str) -> str:
    payload = {
        'sub': str(usuario_id), 
        'perfil': perfil,
        'exp': datetime.now(timezone.utc) + timedelta(hours=8)
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    
    if isinstance(token, bytes):
        return token.decode('utf-8')
    return token

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1].strip()
        
        if not token:
            return jsonify({'mensagem': 'Token de acesso ausente!'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            current_user = data
        except jwt.ExpiredSignatureError:
            return jsonify({'mensagem': 'Token expirado!'}), 401
        except jwt.InvalidTokenError as e:
            print(f"\n[ERRO DE JWT] O Token falhou: {str(e)}")
            return jsonify({'mensagem': f'Token inválido! Detalhe: {str(e)}'}), 401
        except Exception as e:
            print(f"\n[ERRO GERAL DE SEGURANÇA] {str(e)}")
            return jsonify({'mensagem': 'Erro interno ao validar o acesso.'}), 500

        return f(current_user, *args, **kwargs)
    return decorated