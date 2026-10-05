# Online Retail — Interactive Customer Analytics

Dashboard interativo de portfólio com o dataset público [Online Retail da UCI](https://archive.ics.uci.edu/dataset/352/online+retail): quem realmente gera valor numa loja online britânica de presentes?

## Principais resultados
541.909 registros brutos; 530.104 vendas válidas; 18.532 pedidos; 4.338 clientes; £ 8,91 milhões analisados.
O Top 5% dos clientes concentra 50,31% da receita; VIPs são 19,25% dos clientes e geram 67,61%.
A correlação de Spearman entre pedidos e ticket médio é fraca (0,16): frequência e ticket são mecanismos diferentes de gerar valor.

## O que dá pra fazer no dashboard
- Filtrar por segmento (clicando nas barras do topo, nos chips ou nas legendas) e por país (no seletor ou clicando no gráfico de países). Todos os gráficos, KPIs e a tabela reagem juntos.
- Ver a receita mês a mês por segmento, alternando entre receita e pedidos.
- Explorar a curva de concentração com um controle "Top X% dos clientes".
- Ver cada um dos 4.338 clientes num gráfico de dispersão com os cortes da segmentação, e clicar para abrir a ficha do cliente.
- Ver o mapa de calor de dia da semana × hora das compras.
- Buscar, ordenar e paginar a tabela de clientes, e baixar o recorte filtrado em CSV.
- Compartilhar um filtro: ele fica salvo na URL (ex.: `index.html#seg=0&pais=Germany`).

## Estrutura
- `index.html`: dashboard
- `assets/style.css`: layout responsivo, com tema claro e escuro automáticos
- `assets/dashboard.js`: filtros, gráficos e interações
- `assets/data.js`: dados agregados por cliente, gerados pelo script Python
- `src/analysis.py`: reprodução da análise e geração de `assets/data.js`
- `requirements.txt`: dependências Python

## Reproduzir a análise
```
pip install -r requirements.txt
python src/analysis.py                       # baixa da UCI
python src/analysis.py "Online Retail.xlsx"  # ou usa o arquivo local
```

## Abrir e publicar
Abra `index.html` com internet disponível (Chart.js e as fontes vêm de CDN).
No GitHub Pages: envie a pasta mantendo `index.html` na raiz e use **Settings > Pages > Deploy from a branch > main > /(root)**.
