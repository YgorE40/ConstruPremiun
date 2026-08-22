CREATE TABLE produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    quantidade INTEGER DEFAULT 0
);

INSERT INTO produtos (nome, quantidade) VALUES
('Produto A', 10),
('Produto B', 25);