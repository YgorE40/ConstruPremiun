checkAuth();

let carrinho = [];
let listaProdutos = [];
let listaClientes = [];
let listaFuncionarios = [];
let listaMarcas = [];
let listaFornecedores = [];

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (usuario.nome) {
        document.getElementById('userDisplay').innerText = `Usuário: ${usuario.nome} (${usuario.perfil})`;
    }
    carregarMarcasEFornecedores().then(() => {
        carregarProdutos();
    });
    carregarClientes();
    carregarFuncionarios();
    carregarVendedores();
});

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    };
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    
    // Agora o menu também recarrega as listas quando você clica nas abas
    if (sectionId === 'relatoriosSection') carregarRelatorios();
    if (sectionId === 'historicoVendasSection') carregarHistoricoVendas();
    if (sectionId === 'funcionariosSection') carregarFuncionarios();
    if (sectionId === 'marcasSection') carregarMarcas();
    if (sectionId === 'fornecedoresSection') carregarFornecedores();
}

function fecharModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// --- MARCAS & FORNECEDORES (FUNÇÃO AUXILIAR INICIAL) ---
async function carregarMarcasEFornecedores() {
    try {
        const [resMarcas, resFornecedores] = await Promise.all([
            fetch(`${API_URL}/marcas`, { headers: getAuthHeaders() }).catch(() => null),
            fetch(`${API_URL}/fornecedores`, { headers: getAuthHeaders() }).catch(() => null)
        ]);
        
        if (resMarcas && resMarcas.ok) listaMarcas = await resMarcas.json();
        if (resFornecedores && resFornecedores.ok) listaFornecedores = await resFornecedores.json();
        
        atualizarSelectsProdutos();
    } catch (e) {
        console.warn("Erro ao carregar marcas ou fornecedores. As APIs já foram criadas?", e);
    }
}

function atualizarSelectsProdutos() {
    const sMarca = document.getElementById('pMarca');
    const sFornecedor = document.getElementById('pFornecedor');
    
    if (sMarca) {
        sMarca.innerHTML = '<option value="">Sem marca</option>';
        listaMarcas.forEach(m => sMarca.innerHTML += `<option value="${m.id}">${m.nome}</option>`);
    }
    if (sFornecedor) {
        sFornecedor.innerHTML = '<option value="">Sem fornecedor</option>';
        listaFornecedores.forEach(f => sFornecedor.innerHTML += `<option value="${f.id}">${f.nome_razao_social}</option>`);
    }
}


// --- CADASTRO DE MARCAS ---
async function carregarMarcas() {
    const res = await fetch(`${API_URL}/marcas`, { headers: getAuthHeaders() }).catch(() => null);
    if (!res || !res.ok) return;
    listaMarcas = await res.json();
    
    const tableBody = document.querySelector('#marcasTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    listaMarcas.forEach(m => {
        tableBody.innerHTML += `<tr>
            <td>${m.id}</td>
            <td>${m.nome}</td>
            <td>${m.cnpj || '-'}</td>
            <td>${m.telefone || '-'}</td>
            <td>${m.endereco || '-'}</td>
            <td>
                <button class="btn-sm btn-edit" onclick="prepararEdicaoMarca(${m.id})">Editar</button>
            </td>
        </tr>`;
    });
    atualizarSelectsProdutos();
}

document.getElementById('marcaForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('mId').value;
    
    const payload = { 
        nome: document.getElementById('mNome').value,
        cnpj: document.getElementById('mCnpj') ? document.getElementById('mCnpj').value : null,
        telefone: document.getElementById('mTelefone') ? document.getElementById('mTelefone').value : null,
        endereco: document.getElementById('mEndereco') ? document.getElementById('mEndereco').value : null
    };

    const url = id ? `${API_URL}/marcas/${id}` : `${API_URL}/marcas`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (res.ok) {
            alert(id ? 'Marca atualizada!' : 'Marca cadastrada!');
            limparFormMarca();
            carregarMarcas();
        } else {
            alert('Erro ao salvar. O Backend (Python) de Marcas já está configurado?');
        }
    } catch (err) {
        alert('Falha na comunicação com o servidor. Verifique o app.py.');
    }
});

function prepararEdicaoMarca(id) {
    const m = listaMarcas.find(x => x.id === id);
    if (!m) return;
    document.getElementById('mId').value = m.id;
    document.getElementById('mNome').value = m.nome;
    
    if (document.getElementById('mCnpj')) document.getElementById('mCnpj').value = m.cnpj || '';
    if (document.getElementById('mTelefone')) document.getElementById('mTelefone').value = m.telefone || '';
    if (document.getElementById('mEndereco')) document.getElementById('mEndereco').value = m.endereco || '';
    
    document.getElementById('btnSalvarMarca').innerText = 'Atualizar Marca';
    document.getElementById('btnCancelarEditMarca').style.display = 'inline-block';
}

function limparFormMarca() {
    document.getElementById('mId').value = '';
    document.getElementById('marcaForm').reset();
    document.getElementById('btnSalvarMarca').innerText = 'Cadastrar Marca';
    document.getElementById('btnCancelarEditMarca').style.display = 'none';
}


// --- CADASTRO DE FORNECEDORES ---
async function carregarFornecedores() {
    const tableBody = document.querySelector('#fornecedoresTable tbody');
    if (!tableBody) return;

    let res;
    try {
        res = await fetch(`${API_URL}/fornecedores`, { headers: getAuthHeaders() });
    } catch (err) {
        tableBody.innerHTML = '';
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = 'Não foi possível conectar ao backend Python. Verifique se ele está em execução na porta 5000.';
        return;
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        tableBody.innerHTML = '';
        const row = tableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = data.mensagem || `Erro ao carregar fornecedores (HTTP ${res.status}).`;
        return;
    }

    listaFornecedores = await res.json();
    tableBody.innerHTML = '';

    listaFornecedores.forEach(f => {
        tableBody.innerHTML += `<tr>
            <td>${f.id}</td>
            <td>${f.nome_razao_social}</td>
            <td>${f.cnpj || '-'}</td>
            <td>${f.telefone || '-'}</td>
            <td>${f.contato || '-'}</td>
            <td>
                <button class="btn-sm btn-edit" onclick="prepararEdicaoFornecedor(${f.id})">Editar</button>
            </td>
        </tr>`;
    });
    atualizarSelectsProdutos();
}

document.getElementById('fornecedorForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('forId').value;
    const payload = {
        nome_razao_social: document.getElementById('forNome').value,
        cnpj: document.getElementById('forCnpj').value || null,
        telefone: document.getElementById('forTelefone').value || null,
        contato: document.getElementById('forContato').value || null
    };

    const url = id ? `${API_URL}/fornecedores/${id}` : `${API_URL}/fornecedores`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (res.ok) {
            alert(id ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!');
            limparFormFornecedor();
            carregarFornecedores();
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.mensagem || `Erro ao salvar fornecedor (HTTP ${res.status}).`);
        }
    } catch (err) {
        alert('Falha na comunicação com o servidor. Verifique o app.py.');
    }
});

function prepararEdicaoFornecedor(id) {
    const f = listaFornecedores.find(x => x.id === id);
    if (!f) return;
    document.getElementById('forId').value = f.id;
    document.getElementById('forNome').value = f.nome_razao_social;
    document.getElementById('forCnpj').value = f.cnpj || '';
    document.getElementById('forTelefone').value = f.telefone || '';
    document.getElementById('forContato').value = f.contato || '';
    
    document.getElementById('btnSalvarFornecedor').innerText = 'Atualizar Fornecedor';
    document.getElementById('btnCancelarEditFornecedor').style.display = 'inline-block';
}

function limparFormFornecedor() {
    document.getElementById('forId').value = '';
    document.getElementById('fornecedorForm').reset();
    document.getElementById('btnSalvarFornecedor').innerText = 'Cadastrar Fornecedor';
    document.getElementById('btnCancelarEditFornecedor').style.display = 'none';
}


// --- PRODUTOS ---
async function carregarProdutos() {
    const res = await fetch(`${API_URL}/produtos`, { headers: getAuthHeaders() });
    listaProdutos = await res.json();
    
    const select = document.getElementById('pdvProduto');
    const tableBody = document.querySelector('#produtosTable tbody');
    
    if(select) select.innerHTML = '';
    if(tableBody) tableBody.innerHTML = '';

    listaProdutos.forEach(p => {
        let nomeMarca = p.marca_nome || listaMarcas.find(m => m.id == p.marca_id)?.nome || '-';
        
        if (select) {
            let desc = p.nome;
            if (nomeMarca !== '-') desc += ` (${nomeMarca})`;
            select.innerHTML += `<option value="${p.id}">${desc} - R$ ${p.preco_venda} (${p.unidade_medida})</option>`;
        }
        
        const isAlerta = p.estoque_atual <= p.estoque_minimo;
        const status = isAlerta ? '<span class="badge-alert">Estoque Baixo</span>' : 'OK';

        if(tableBody) {
            tableBody.innerHTML += `<tr>
                <td>${p.id}</td>
                <td>${p.nome}</td>
                <td>${nomeMarca}</td>
                <td>${p.categoria}</td>
                <td>${p.unidade_medida}</td>
                <td>R$ ${parseFloat(p.preco_venda).toFixed(2)}</td>
                <td>${p.estoque_atual}</td>
                <td>${status}</td>
                <td>
                    <button class="btn-sm btn-edit" onclick="prepararEdicaoProduto(${p.id})">Editar</button>
                    <button class="btn-sm btn-delete" onclick="desativarProduto(${p.id})">Excluir</button>
                </td>
            </tr>`;
        }
    });
}

document.getElementById('produtoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pId').value;
    
    const payload = {
        nome: document.getElementById('pNome').value,
        marca_id: document.getElementById('pMarca').value || null,
        fornecedor_id: document.getElementById('pFornecedor').value || null,
        categoria: document.getElementById('pCategoria').value,
        unidade_medida: document.getElementById('pUnidade').value,
        preco_venda: parseFloat(document.getElementById('pPreco').value),
        estoque_atual: parseFloat(document.getElementById('pEstoque').value),
        estoque_minimo: parseFloat(document.getElementById('pEstoqueMin').value)
    };

    const url = id ? `${API_URL}/produtos/${id}` : `${API_URL}/produtos`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });

    if (res.ok) {
        alert(id ? 'Produto atualizado!' : 'Produto cadastrado!');
        limparFormProduto();
        carregarProdutos();
    } else {
        const data = await res.json();
        alert(data.mensagem || 'Erro ao salvar produto.');
    }
});

function prepararEdicaoProduto(id) {
    const produto = listaProdutos.find(p => p.id === id);
    if (!produto) return;

    document.getElementById('pId').value = produto.id;
    document.getElementById('pNome').value = produto.nome;
    document.getElementById('pMarca').value = produto.marca_id || '';
    document.getElementById('pFornecedor').value = produto.fornecedor_id || '';
    document.getElementById('pCategoria').value = produto.categoria;
    document.getElementById('pUnidade').value = produto.unidade_medida;
    document.getElementById('pPreco').value = produto.preco_venda;
    document.getElementById('pEstoque').value = produto.estoque_atual;
    document.getElementById('pEstoqueMin').value = produto.estoque_minimo;

    document.getElementById('btnSalvarProduto').innerText = 'Atualizar Produto';
    document.getElementById('btnCancelarEditProduto').style.display = 'inline-block';
}

function limparFormProduto() {
    document.getElementById('pId').value = '';
    document.getElementById('produtoForm').reset();
    document.getElementById('btnSalvarProduto').innerText = 'Salvar Produto';
    document.getElementById('btnCancelarEditProduto').style.display = 'none';
}

async function desativarProduto(id) {
    if (!confirm('Deseja realmente remover/zerar este produto?')) return;
    const res = await fetch(`${API_URL}/produtos/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) {
        alert('Operação realizada com sucesso!');
        carregarProdutos();
    }
}

// --- CLIENTES ---
async function carregarClientes() {
    const res = await fetch(`${API_URL}/clientes`, { headers: getAuthHeaders() });
    listaClientes = await res.json();
    
    const select = document.getElementById('pdvCliente');
    const tableBody = document.querySelector('#clientesTable tbody');
    
    select.innerHTML = '<option value="">Venda Avulsa (Balcão)</option>';
    tableBody.innerHTML = '';

    listaClientes.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nome_razao_social}</option>`;
        tableBody.innerHTML += `<tr>
            <td>${c.id}</td>
            <td>${c.nome_razao_social}</td>
            <td>${c.cpf_cnpj || '-'}</td>
            <td>${c.telefone || '-'}</td>
            <td>${c.endereco || 'Retirada no Balcão'}</td>
            <td>
                <button class="btn-sm btn-info" onclick="verHistoricoCliente(${c.id}, '${c.nome_razao_social}')">Compras</button>
                <button class="btn-sm btn-edit" onclick="prepararEdicaoCliente(${c.id})">Editar</button>
                <button class="btn-sm btn-delete" onclick="desativarCliente(${c.id})">Desativar</button>
            </td>
        </tr>`;
    });
}

document.getElementById('clienteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cId').value;
    
    const payload = {
        nome_razao_social: document.getElementById('cNome').value,
        cpf_cnpj: document.getElementById('cCpfCnpj').value || null,
        telefone: document.getElementById('cTelefone').value || null,
        email: document.getElementById('cEmail').value || null,
        endereco: document.getElementById('cEndereco').value || null
    };

    const url = id ? `${API_URL}/clientes/${id}` : `${API_URL}/clientes`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });

    if (res.ok) {
        alert(id ? 'Cliente atualizado!' : 'Cliente cadastrado!');
        limparFormCliente();
        carregarClientes();
    } else {
        const data = await res.json();
        alert(data.mensagem || 'Erro na operação.');
    }
});

function prepararEdicaoCliente(id) {
    const cliente = listaClientes.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('cId').value = cliente.id;
    document.getElementById('cNome').value = cliente.nome_razao_social;
    document.getElementById('cCpfCnpj').value = cliente.cpf_cnpj || '';
    document.getElementById('cTelefone').value = cliente.telefone || '';
    document.getElementById('cEmail').value = cliente.email || '';
    document.getElementById('cEndereco').value = cliente.endereco || '';

    document.getElementById('btnSalvarCliente').innerText = 'Atualizar Cliente';
    document.getElementById('btnCancelarEditCliente').style.display = 'inline-block';
}

function limparFormCliente() {
    document.getElementById('cId').value = '';
    document.getElementById('clienteForm').reset();
    document.getElementById('btnSalvarCliente').innerText = 'Cadastrar Cliente';
    document.getElementById('btnCancelarEditCliente').style.display = 'none';
}

async function desativarCliente(id) {
    if (!confirm('Deseja realmente desativar este cliente?')) return;
    const res = await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) {
        alert('Cliente desativado!');
        carregarClientes();
    }
}

async function verHistoricoCliente(id, nome) {
    const res = await fetch(`${API_URL}/clientes/${id}/vendas`, { headers: getAuthHeaders() });
    const vendas = await res.json();

    document.getElementById('modalClienteNome').innerText = nome;
    const tbody = document.getElementById('modalClienteHistoricoBody');
    tbody.innerHTML = '';

    if (vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nenhuma compra registrada para este cliente.</td></tr>';
    } else {
        vendas.forEach(v => {
            tbody.innerHTML += `<tr>
                <td>#${v.id}</td>
                <td>${new Date(v.data_venda).toLocaleString('pt-BR')}</td>
                <td>${v.forma_pagamento}</td>
                <td>R$ ${parseFloat(v.valor_total).toFixed(2)}</td>
                <td>${v.status}</td>
            </tr>`;
        });
    }

    document.getElementById('modalClienteHistorico').classList.add('active');
}

// --- FUNCIONÁRIOS ---
async function carregarFuncionarios() {
    const res = await fetch(`${API_URL}/funcionarios`, { headers: getAuthHeaders() });
    listaFuncionarios = await res.json();

    const tableBody = document.querySelector('#funcionariosTable tbody');
    const selectMotorista = document.getElementById('pdvMotorista');
    
    if (selectMotorista) {
        selectMotorista.innerHTML = '<option value="">Sem Entrega (Retirada no Balcão)</option>';
        
        const motoristas = listaFuncionarios.filter(f => {
            const cargo = (f.cargo || '').toLowerCase();
            return cargo.includes('motorista') || cargo.includes('entregador');
        });

        motoristas.forEach(f => {
            selectMotorista.innerHTML += `<option value="${f.id}">${f.nome} (${f.cargo})</option>`;
        });
    }

    if (!tableBody) return;
    tableBody.innerHTML = '';

    listaFuncionarios.forEach(f => {
        tableBody.innerHTML += `<tr>
            <td>${f.id}</td>
            <td>${f.nome}</td>
            <td>${f.cargo}</td>
            <td>${f.cpf || '-'}</td>
            <td>${f.telefone || '-'}</td>
            <td>
                <button class="btn-sm btn-info" onclick="criarLoginFuncionarioPrompt(${f.id})">Criar Login</button>
                <button class="btn-sm btn-edit" onclick="prepararEdicaoFuncionario(${f.id})">Editar</button>
                <button class="btn-sm btn-delete" onclick="desativarFuncionario(${f.id})">Desativar</button>
            </td>
        </tr>`;
    });
}

document.getElementById('funcionarioForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('fId').value;

    const payload = {
        nome: document.getElementById('fNome').value,
        cargo: document.getElementById('fCargo').value,
        cpf: document.getElementById('fCpf').value || null,
        telefone: document.getElementById('fTelefone').value || null
    };

    const url = id ? `${API_URL}/funcionarios/${id}` : `${API_URL}/funcionarios`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });

    if (res.ok) {
        alert(id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!');
        limparFormFuncionario();
        carregarFuncionarios();
    } else {
        const data = await res.json();
        alert(data.mensagem || 'Erro ao salvar funcionário.');
    }
});

function prepararEdicaoFuncionario(id) {
    const funcionario = listaFuncionarios.find(f => f.id === id);
    if (!funcionario) return;

    document.getElementById('fId').value = funcionario.id;
    document.getElementById('fNome').value = funcionario.nome;
    document.getElementById('fCargo').value = funcionario.cargo;
    document.getElementById('fCpf').value = funcionario.cpf || '';
    document.getElementById('fTelefone').value = funcionario.telefone || '';

    document.getElementById('btnSalvarFuncionario').innerText = 'Atualizar Funcionário';
    document.getElementById('btnCancelarEditFuncionario').style.display = 'inline-block';
}

function limparFormFuncionario() {
    document.getElementById('fId').value = '';
    document.getElementById('funcionarioForm').reset();
    document.getElementById('btnSalvarFuncionario').innerText = 'Cadastrar Funcionário';
    document.getElementById('btnCancelarEditFuncionario').style.display = 'none';
}

async function desativarFuncionario(id) {
    if (!confirm('Deseja realmente desativar este funcionário?')) return;
    const res = await fetch(`${API_URL}/funcionarios/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) {
        alert('Funcionário desativado!');
        carregarFuncionarios();
    }
}


// --- PDV E HISTÓRICO DE VENDAS ---
function adicionarItemCarrinho() {
    const prodId = parseInt(document.getElementById('pdvProduto').value);
    const qtd = parseFloat(document.getElementById('pdvQtd').value);
    const produto = listaProdutos.find(p => p.id === prodId);

    if (!produto || qtd <= 0) return;

    const subtotal = produto.preco_venda * qtd;
    carrinho.push({ produto_id: produto.id, nome: produto.nome, quantidade: qtd, subtotal });
    atualizarCarrinhoDOM();
}

function atualizarCarrinhoDOM() {
    const tbody = document.querySelector('#carrinhoTable tbody');
    tbody.innerHTML = '';
    let total = 0;

    carrinho.forEach((item, index) => {
        total += item.subtotal;
        tbody.innerHTML += `<tr>
            <td>${item.nome}</td>
            <td>${item.quantidade}</td>
            <td>R$ ${item.subtotal.toFixed(2)}</td>
            <td><button onclick="removerItem(${index})">X</button></td>
        </tr>`;
    });

    document.getElementById('carrinhoTotal').innerText = total.toFixed(2);
}

function removerItem(index) {
    carrinho.splice(index, 1);
    atualizarCarrinhoDOM();
}

async function finalizarVenda() {
    if (carrinho.length === 0) return alert('O carrinho está vazio!');

    const payload = {
        cliente_id: document.getElementById('pdvCliente').value || null,
        motorista_id: document.getElementById('pdvMotorista').value || null,
        vendedor_id: document.getElementById('vendedor_id').value || null,
        forma_pagamento: document.getElementById('pdvPagamento').value,
        itens: carrinho
    };

    const res = await fetch(`${API_URL}/vendas`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        alert('Venda realizada com sucesso!');
        carrinho = [];
        atualizarCarrinhoDOM();
        carregarProdutos();
    } else {
        const data = await res.json();
        alert(data.mensagem || 'Erro ao realizar venda.');
    }
}

// --- HISTÓRICO E EDIÇÃO DE VENDAS ---
async function carregarHistoricoVendas() {
    const res = await fetch(`${API_URL}/vendas`, { headers: getAuthHeaders() });
    const vendas = await res.json();

    const tbody = document.querySelector('#historicoVendasTable tbody');
    tbody.innerHTML = '';

    vendas.forEach(v => {
        tbody.innerHTML += `<tr>
            <td>#${v.id}</td>
            <td>${new Date(v.data_venda).toLocaleString('pt-BR')}</td>
            <td>${v.cliente_nome || 'Venda Balcão'}</td>
            <td>${v.usuario_nome || '-'}</td>
            <td>R$ ${parseFloat(v.valor_total).toFixed(2)}</td>
            <td>${v.forma_pagamento}</td>
            <td>${v.status}</td>
            <td>
                <button class="btn-sm btn-info" onclick="verDetalhesVenda(${v.id})">Ver Itens</button>
                <button class="btn-sm btn-edit" onclick="abrirModalEdicaoVenda(${v.id})">Editar</button>
                ${v.status !== 'Cancelada' ? `<button class="btn-sm btn-delete" onclick="cancelarVenda(${v.id})">Cancelar</button>` : ''}
            </td>
        </tr>`;
    });
}

let vendaAtualParaEdicao = null;

async function abrirModalEdicaoVenda(vendaId) {
    vendaAtualParaEdicao = vendaId;
    
    const res = await fetch(`${API_URL}/vendas/${vendaId}`, { headers: getAuthHeaders() });
    if (!res.ok) return alert("Erro ao buscar detalhes da venda.");
    
    const data = await res.json();
    const venda = data.venda;

    document.getElementById('editVendaId').innerText = venda.id;
    document.getElementById('editVendaPagamento').value = venda.forma_pagamento;
    document.getElementById('editVendaStatus').value = venda.status;

    const selectMotorista = document.getElementById('editVendaMotorista');
    selectMotorista.innerHTML = '<option value="">Sem Entrega (Retirada no Balcão)</option>';
    
    const motoristas = listaFuncionarios.filter(f => {
        const cargo = (f.cargo || '').toLowerCase();
        return cargo.includes('motorista') || cargo.includes('entregador');
    });

    motoristas.forEach(f => {
        const isSelected = venda.motorista_id === f.id ? 'selected' : '';
        selectMotorista.innerHTML += `<option value="${f.id}" ${isSelected}>${f.nome} (${f.cargo})</option>`;
    });

    document.getElementById('modalEditarVenda').classList.add('active');
}

async function confirmarEdicaoVenda() {
    if (!vendaAtualParaEdicao) return;

    const payload = {
        forma_pagamento: document.getElementById('editVendaPagamento').value,
        status: document.getElementById('editVendaStatus').value,
        motorista_id: document.getElementById('editVendaMotorista').value || null
    };

    try {
        const res = await fetch(`${API_URL}/vendas/${vendaAtualParaEdicao}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();

        if (res.ok) {
            alert("Venda atualizada com sucesso!");
            fecharModal('modalEditarVenda');
            carregarHistoricoVendas(); 
        } else {
            alert(data.mensagem || 'Erro ao atualizar venda.');
        }
    } catch (err) {
        alert("Erro na requisição: " + err.message);
    }
}

async function verDetalhesVenda(vendaId) {
    const res = await fetch(`${API_URL}/vendas/${vendaId}`, { headers: getAuthHeaders() });
    const data = await res.json();

    document.getElementById('detalheVendaId').innerText = data.venda.id;
    document.getElementById('detalheVendaCliente').innerText = data.venda.cliente_nome || 'Venda Balcão';
    document.getElementById('detalheVendaEndereco').innerText = data.venda.cliente_endereco || 'Não informado / Retirada no Balcão';
    document.getElementById('detalheVendaMotorista').innerText = data.venda.motorista_nome || 'Nenhum / Retirada no Balcão';
    document.getElementById('detalheVendaUsuario').innerText = data.venda.usuario_nome;
    document.getElementById('detalheVendaPagamento').innerText = data.venda.forma_pagamento;
    document.getElementById('detalheVendaStatus').innerText = data.venda.status;
    document.getElementById('detalheVendaTotal').innerText = parseFloat(data.venda.valor_total).toFixed(2);

    const tbody = document.getElementById('detalheVendaItens');
    tbody.innerHTML = '';
    data.itens.forEach(item => {
        tbody.innerHTML += `<tr>
            <td>${item.produto_nome}</td>
            <td>${item.quantidade} ${item.unidade_medida}</td>
            <td>R$ ${parseFloat(item.preco_unitario).toFixed(2)}</td>
            <td>R$ ${parseFloat(item.subtotal).toFixed(2)}</td>
        </tr>`;
    });

    document.getElementById('modalVenda').classList.add('active');
}

async function cancelarVenda(vendaId) {
    if (!confirm('Deseja realmente cancelar esta venda? O estoque será estornado.')) return;

    const res = await fetch(`${API_URL}/vendas/${vendaId}/cancelar`, {
        method: 'POST',
        headers: getAuthHeaders()
    });

    if (res.ok) {
        alert('Venda cancelada e estoque estornado com sucesso!');
        carregarHistoricoVendas();
        carregarProdutos();
    }
}

// --- RELATÓRIOS ---
async function carregarRelatorios() {
    const res = await fetch(`${API_URL}/relatorios/resumo`, { headers: getAuthHeaders() });
    const data = await res.json();

    document.getElementById('relTotalFaturado').innerText = data.total_faturado.toFixed(2);
    
    const tbody = document.querySelector('#relTopProdutosTable tbody');
    tbody.innerHTML = '';
    data.top_produtos.forEach(p => {
        tbody.innerHTML += `<tr><td>${p.nome}</td><td>${p.total_vendido}</td></tr>`;
    });
}

async function carregarVendedores() {
    try {
        const token = localStorage.getItem('token');
        const resposta = await fetch('http://localhost:5000/api/usuarios', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (resposta.ok) {
            const usuarios = await resposta.json();
            const selectVendedor = document.getElementById('vendedor_id');
            
            if (selectVendedor) {
                selectVendedor.innerHTML = '<option value="">Selecione o vendedor...</option>';
                
                usuarios.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = `${user.nome} (${user.perfil})`;
                    selectVendedor.appendChild(option);
                });

                const usuarioLogado = JSON.parse(localStorage.getItem('usuario'));
                if (usuarioLogado && usuarioLogado.id) {
                    selectVendedor.value = usuarioLogado.id;
                }
            }
        }
    } catch (erro) {
        console.error("Erro ao carregar vendedores:", erro);
    }
}

async function criarLoginFuncionarioPrompt(funcId) {
    const login = prompt("Digite o nome de usuário (login) para o funcionário:");
    if (!login || login.trim() === '') return alert("A operação foi cancelada: o login não pode ser vazio.");
    
    const senha = prompt("Digite a senha:");
    if (!senha || senha.trim() === '') return alert("A operação foi cancelada: a senha não pode ser vazia.");

    const perfil = prompt("Perfil de acesso (Admin, Caixa, Vendedor):", "Vendedor") || "Vendedor";

    try {
        const res = await fetch(`${API_URL}/funcionarios/${funcId}/criar-login`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                login: login.trim(), 
                senha: senha.trim(), 
                perfil: perfil.trim() 
            })
        });

        const data = await res.json();
        
        if (res.ok) {
            alert(data.mensagem || "Login criado com sucesso!");
        } else {
            alert(`${data.mensagem || 'Erro ao criar login'}${data.erro ? `\nDetalhe: ${data.erro}` : ''}`);
        }
    } catch (err) {
        alert("Erro na requisição: " + err.message);
    }
}

async function salvarEdicaoVenda(vendaId, dadosDaVenda) {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://127.0.0.1:5000/api/vendas/${vendaId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(dadosDaVenda)
    });
    
    const data = await res.json();
    alert(data.mensagem);
}