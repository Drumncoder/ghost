# Caraguá Ghostship — Painel de desempenho

KPI de futebol americano para acompanhar o desempenho do elenco por posição, separando **jogos** e **treinos**. Aplicação estática, em português (pt-BR), sem backend e sem dependências de build.

## Como usar

1. Abra o arquivo `index.html` no navegador **ou** sirva a pasta localmente:

   ```bash
   cd GHOST
   python -m http.server 4173
   ```

   Depois acesse `http://localhost:4173/`.

2. Na primeira visita, o painel carrega automaticamente **15 atletas e 165 sessões de exemplo** (5 jogos e 6 treinos por atleta).
3. Use **Registrar sessão** para lançar um jogo ou treino e **Novo atleta** para cadastrar alguém do elenco.

> Os dados ficam no `localStorage` do navegador, na chave `ghostship-kpi-v1`. Cada navegador/origem tem sua própria base. Use **Exportar → Backup completo em JSON** com regularidade e **Importar backup** para restaurar ou migrar.

## O que o painel faz

- **Painel**: índice geral, médias de jogo e treino, ranking do elenco, comparativo por posição, últimas sessões e explicação do cálculo.
- **Atletas**: elenco em cards, busca, filtros por posição/unidade e ficha individual com radar dos quatro pilares e histórico recente.
- **Sessões**: registro completo de jogos e treinos, com filtros por tipo, unidade e busca por atleta/contexto. Cada sessão pode ser editada ou excluída.
- **Exportação**: planilha CSV (UTF-8 com BOM e separador `;`, pronta para Excel em pt-BR) e backup JSON completo.
- **Responsivo** e com estilos de impressão.

## Como o Índice Ghost é calculado

Cada sessão gera uma nota de 0 a 100 a partir de quatro pilares:

| Pilar | Peso | Como é medido |
| --- | --- | --- |
| Produção | 40% | Estatísticas da posição, normalizadas pela referência da posição |
| Eficiência | 20% | Aproveitamento (ex.: taxa de conclusão, jardas por tentativa, impacto por participação) |
| Avaliação técnica | 20% | Média de técnica, intensidade e leitura de jogo (notas de 0 a 10), convertida para 0–100 |
| Disciplina | 20% | Começa em 100 e desconta penalidades e erros específicos da posição |

- A produção é limitada a 100 e usa uma **referência própria por posição**. Em treinos, a referência cai para **62%** da referência de jogo, porque o volume de repetições é menor.
- Se a posição não tiver volume para medir eficiência (ex.: quarterback sem passes tentados), o pilar é ignorado e os pesos restantes são redistribuídos proporcionalmente.
- O **índice geral do atleta** é a média das sessões: **65% jogos + 35% treinos** quando existem os dois. Se só houver um tipo, ele responde por 100%.
- A **tendência** compara a média das três sessões mais recentes com a das três anteriores.

### Referências de produção

| Posição | Produção considerada | Referência (jogo) |
| --- | --- | --- |
| QB | Jardas aéreas + TDs − interceptações (com bônus de completos e desconto de sacks) | 280 |
| RB | Jardas + TDs − fumbles | 140 |
| WR | Jardas + recepções + TDs − drops | 130 |
| TE | Jardas + recepções + blocos − drops | 120 |
| OL | Blocos − sacks cedidos | 100 |
| DL | Tackles + sacks + TFL + pressões | 80 |
| LB | Tackles + assistências + impactos | 105 |
| DB | Tackles + INTs + defesas − passes cedidos | 80 |
| K | FGs + XPs − chutes errados | 55 |
| P | Jardas de punt + inside 20 − touchbacks | 110 |

## Posições e unidades

- **Ataque**: QB, RB, WR, TE, OL
- **Defesa**: DL, LB, DB
- **Times especiais**: K, P

Cada sessão guarda a posição usada naquele dia. Se um atleta mudar de posição, o histórico anterior não é recalculado.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html` | Estrutura da página, navegação e contêineres de modal/drawer |
| `styles.css` | Identidade visual, layout responsivo e estilos de impressão |
| `app.js` | Modelo de dados, configuração das posições, cálculo do índice, dados de exemplo, formulários, persistência e exportação |

## Limitações

- Não há login nem sincronização entre dispositivos: os dados são locais ao navegador.
- Limpar os dados do site no navegador apaga a base; mantenha um backup JSON.
- As fontes vêm do Google Fonts. Sem internet, o app continua funcionando com as fontes de fallback.
