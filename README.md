# Inspeções — fotografias de inspeção (PWA para Android)

Tirar as fotos da inspeção no telemóvel e guardá-las logo na pasta certa do processo, divisão a divisão.

**Esta versão não usa o OneDrive.** As fotos ficam numa pasta da memória do telemóvel, com a mesma estrutura de
pastas da biblioteca da empresa (`<processo>/2. Fotos/<divisão>/`). A app já não faz a versão leve (`3. Fotos - Light`).
A ligação ao SharePoint/OneDrive fica para mais tarde e só mexe numa peça (ver "Ligar ao OneDrive").

## Como se usa

1. **Primeira vez:** a app pede para **escolher a pasta do telemóvel** onde guardar tudo (botão "Escolher pasta").
   O Android abre o seletor de pastas: crie uma pasta nova, por exemplo `Inspeções`, dentro de Documentos, entre nela
   e toque em "Utilizar esta pasta". (Se o Chrome recusar uma pasta como Documentos ou Transferências, o que costuma
   acontecer com pastas do sistema, use uma subpasta própria.) Essa pasta vê-se na app Ficheiros do telemóvel.
2. **Novo processo:** na lista, "+ Novo processo" pede o n.º, a morada e (opcional) o cliente, e cria a pasta com o
   nome `<n.º> - <morada> - <cliente>`, como na biblioteca. Mostra o nome da pasta antes de criar. Enquanto o processo
   não tiver fotos, pode ser removido da lista (engano no n.º ou na morada).
3. **Lista de processos**, os mais recentes primeiro, com pesquisa por n.º, morada ou cliente (sem se preocupar com
   acentos ou maiúsculas). Cada processo mostra quantas fotos ainda estão por guardar.
4. **Abrir um processo** → em cima aparecem as **frações** e por baixo as divisões da casa:
   Hall, Sala, Cozinha, Quarto 1, Quarto 2, Quarto 3, Casa de banho 1, Casa de banho 2, Garagem.
   Cada uma mostra quantas fotos já tem.
5. **Frações (prédios):** antes de escolher a divisão, "+ Fração" acrescenta uma fração (apartamento) ao processo:
   "Fração A", "1.º Esq.", "Partes comuns"… Ao escolher uma fração, as divisões e os números passam a ser **dessa fração**
   e as fotos ficam em `2. Fotos/<fração>/<divisão>/`. "Sem fração" (a de origem) é o que sempre houve: as fotos ficam
   logo em `2. Fotos/<divisão>/`, para moradias ou para o que é de todo o prédio. As frações de um processo ficam
   guardadas nele; uma fração criada por engano remove-se enquanto não tiver fotos.
6. **Tocar numa divisão** → abre a câmara já dentro dessa pasta (e dessa fração). O atalho "Próxima: Quarto 1 →"
   passa à divisão seguinte, na mesma fração, sem voltar atrás.
7. **"Outra divisão"** → para o que não está na lista (fachada, cobertura, varanda, arrecadação…).
   Fica guardada nesse processo (para todas as frações), com a sua própria pasta.

O que fica no telemóvel, por exemplo:

```
Documentos / Inspeções /                                  <- a pasta escolhida
    260098 - Praça de Portugal 7 Odivelas - Ana Exemplo /
        2. Fotos /
            Cozinha / 260098_20261103_143015_001_cozinha.jpg      (original, máxima qualidade)
            Fração A /                                            (só em prédios com frações)
                Cozinha / 260098_20261103_143100_002_fracao-a_cozinha.jpg
```

A app só cria a pasta `2. Fotos`. As outras (`0.`, `1.`, `3.` a `7.`) não são criadas.
Para passar para a biblioteca, copiar o conteúdo dessa pasta para as pastas com o mesmo nome do processo
(os nomes dos ficheiros são únicos, por isso juntar não substitui nada).

Por baixo:

- A foto fica guardada na app **antes** de ir para a pasta, e só depois segue por uma fila:
  *por guardar → a guardar → guardada* (ou *erro*). Escrever no telemóvel não precisa de rede, por isso funciona sem ela.
  Se algo falhar, repete sozinho com espera crescente (15 s, 30 s, 1 min… até 10 min); se a app for fechada a meio,
  retoma ao reabrir. Tocar no estado, no topo, repete já os erros.
- **O Android pode voltar a pedir autorização para a pasta** (por exemplo, no dia seguinte). Aparece um aviso
  "Autorizar" no topo; as fotos tiradas entretanto ficam a aguardar e são guardadas assim que autorizar.
  Tocar no estado, no topo, também autoriza.
- Câmara dentro da app, para tirar fotos seguidas, com lanterna quando o telemóvel tem. Pede ao telemóvel a
  **resolução máxima de foto que o Chrome indica**; se ele não aceitar, usa a resolução normal da câmara e, em último
  caso, a imagem do ecrã (1080p). Em cima da imagem, uma linha mostra com que resolução vão ser tiradas as fotos
  (ex.: "Foto: 4000 × 3000 px · 12,0 MP"). Se a câmara não abrir, há o botão "Câmara do sistema".
- **Câmara do telemóvel (de origem):** para ter a qualidade e o processamento da câmara do próprio telemóvel.
  Para **várias fotos seguidas**: abrir a câmara normal do telemóvel, fotografar a divisão toda, voltar à app e tocar em
  **"Juntar fotos da galeria"**, selecionando as fotos (várias de uma vez). Ficam guardadas **tal e qual** em `2. Fotos`,
  pela ordem em que foram tiradas e com a data delas. Uma foto que já tenha sido junta a esse processo não é repetida.
  "Tirar só uma foto" abre a câmara do telemóvel para uma foto e volta logo. (Uma página web não consegue manter a
  câmara do telemóvel aberta para várias fotos e recebê-las todas: só uma por vez, por isso o caminho é a galeria.)
  "Usar a câmara da app" passa à câmara dentro da app (fotos seguidas e zoom, mas sem o processamento do telemóvel);
  a escolha fica guardada.
- **Zoom 0,5× / 1× / 2× (câmara da app):** três botões sobre a imagem. A app só usa os níveis que o Chrome do telemóvel permite:
  um nível indisponível aparece apagado e, ao tocar, a app explica porquê. O **0,5×** (lente grande angular) só existe
  se o Chrome der acesso a ela, o que **varia de telemóvel para telemóvel**; o 2× pode ser zoom digital (menos detalhe)
  se o telemóvel não usar a lente de zoom. A escolha fica para as divisões seguintes (o telemóvel começa sempre em 1×).
  A linha em cima da imagem mostra o intervalo de zoom que o telemóvel dá (ex.: "zoom 0,5× a 8×" ou "zoom 1× a 8×").
- **Sem versão leve:** a cópia reduzida para `3. Fotos - Light` foi desligada. O código continua em `src/ui/image.ts`
  (`makeLightVersion`, 2500 × 1875 como o Image Resizer); para a voltar a ter basta uma linha em `src/app.ts`.
- **Qualidade:** a foto da app não é igual à da app da câmara do telemóvel: não tem os modos de muitos megapíxeis
  (50/108/200 MP), nem HDR ou modo noite, nem HEIC/RAW. Para essa qualidade, use o botão "Câmara do sistema". O que segue para `2. Fotos` é sempre a foto original. Na app mostra-se uma
  pré-visualização (1280 px) e o detalhe da foto indica a resolução real do original (ex.: "4032 × 3024 px · 12,2 MP").
- Abre e tira fotos sem rede (instalável no ecrã inicial do Android).
- O botão "Voltar" do Android funciona como esperado (câmara → divisões → processos).

## App Android (APK)

Além da versão web, há uma **app Android instalada** (ficheiro APK), feita com Capacitor a partir do mesmo código.
Na app instalada, "Fotografar com a câmara do telemóvel" abre a câmara normal do telemóvel (fotos seguidas, zoom,
todos os modos) e, ao voltar, **todas as fotos tiradas entretanto entram sozinhas** na divisão, tal e qual saíram da
câmara. As fotos ficam em `Documents/Inspeções/<processo>/2. Fotos/<divisão>/` (sem escolher pasta). Se o Android fechar
a app enquanto a câmara está aberta, ao reabrir ela volta à divisão e junta as fotos. As fotos originais continuam
também na galeria do telemóvel.

- Cada `git push` para `main` faz o GitHub construir o APK (`.github/workflows/android.yml`) e publicá-lo em
  **Releases** (`Inspecoes-1.<n>.apk`). Instala-se por cima da versão anterior (mesma assinatura, `signing/`).
- Código Android: `android-src/` (plugin `NativePhotos` e `MainActivity`); `scripts/patch-android.mjs` junta-o ao
  projeto que o Capacitor cria. Do lado da app: `src/native/`, `src/ui/nativeSession.ts`, `src/storage/NativeFolderProvider.ts`.
- Na primeira vez, o telemóvel pede autorização para as fotos: escolher **"Permitir todas"** (com "selecionadas",
  a app não vê as fotos novas).

## Requisitos e avisos

- **Chrome para Android atualizado.** O seletor de pastas só existe nas versões recentes do Chrome para Android
  (as fontes que consultei dizem 132 ou 156, por isso: o mais recente que houver). Se o Chrome não o tiver, a app
  **avisa no topo** e guarda as fotos na memória interna da app, onde **não aparecem na app Ficheiros**.
- Só funciona no **Chrome** (não em Firefox, nem dentro de outras apps). Instalada no ecrã inicial também serve.
- Tal como a câmara, o seletor de pastas só funciona em **HTTPS ou `localhost`**.
- Limitações do Android: não há escritas atómicas nas pastas escolhidas, e pastas gigantes (como a DCIM) podem abrandar
  o seletor. Por isso a pasta deve ser só para isto.

## Como correr

```bash
npm install
npm run dev        # desenvolvimento
npm test           # testes (nomes, pastas, divisões, rotas, fila, processos e pasta do telemóvel)
npm run typecheck
npm run build      # gera a pasta dist/
```

**A câmara e a escolha de pasta só funcionam em HTTPS ou em `localhost`.** Para experimentar num Android:

1. *Por USB:* ativar a depuração USB, ligar ao computador, correr `adb reverse tcp:5173 tcp:5173`
   e abrir `http://localhost:5173` no Chrome do telemóvel.
2. *Publicado:* pôr o conteúdo de `dist/` num alojamento HTTPS (por exemplo Azure Static Web Apps),
   abrir no Chrome e escolher "Instalar app".

Dois endereços especiais, para testes:

- `…/?demo` — a versão de demonstração antiga: processos de exemplo e um "OneDrive de faz de conta", com um painel
  "Modo de teste" para simular falhas.
- `…/?storage=private` — força a memória interna da app (sem escolher pasta). Serve para testes automáticos.

## Onde está cada coisa

| Ficheiro | Para quê |
| --- | --- |
| `src/divisions.ts` | **Lista das divisões** (é aqui que se acrescenta ou tira uma) e sugestões para "Outra divisão" |
| `src/naming.ts` | **Convenção de nomes e pastas** (é aqui que se ajusta) |
| `src/fractions.ts` | **Frações** (apartamentos de um prédio): criar o nome/pasta, sugestões, quais as de cada processo |
| `src/localProcesses.ts` | Criar, listar e remover processos no telemóvel (n.º, morada, cliente → nome da pasta) |
| `src/processNames.ts` | Lê o nome das pastas dos processos (`260098 - morada - cliente`), ordena e pesquisa |
| `src/routes.ts` | Endereços internos (`#/`, `#/p/<processo>`, `#/p/<processo>/<divisão>`, e com fração `#/p/<processo>/f/<fração>[/<divisão>]`) |
| `src/zoom.ts` | Zoom da câmara: níveis 0,5× / 1× / 2×, o que o telemóvel permite, textos |
| `src/queue.ts` | Fila de gravação: estados, repetição (a versão leve está desligada) |
| `src/photoService.ts` | O que acontece ao tirar uma foto: nome, gravação, miniatura, fila |
| `src/storage/StorageProvider.ts` | O "contrato" com o sítio onde as fotos e os processos vivem |
| `src/storage/LocalFolderProvider.ts` | **Guarda as fotos na pasta do telemóvel** (cria as subpastas, escreve o ficheiro) |
| `src/storage/folderAccess.ts` | Escolher a pasta, lembrá-la e pedir autorização de novo (ou usar a memória interna) |
| `src/storage/LocalDemoProvider.ts` | Versão de demonstração (`?demo`) |
| `src/storage/index.ts` | Escolhe qual provider se usa |
| `src/storage/idb.ts` | Fotos por guardar e lista de processos no telemóvel (IndexedDB) |
| `src/ui/` | Ecrãs: processos (`home`), novo processo, frações e divisões (`process`, `addFraction`), câmara (`capture`), detalhe da foto, aviso da pasta; `image.ts` faz as miniaturas e a versão leve |
| `src/styles.css` | Aspeto (cores e tipo inspirados no relatório de peritagem) |
| `public/sw.js` | Service worker (abrir sem rede) |

## Convenção usada (a confirmar)

Estrutura real da biblioteca, confirmada com capturas de ecrã:

```
Geral / 0. Processos / 2026 / 02 Fevereiro / 260098 - Praça de Portugal 7 Odivelas - Ana Mafalda Leiria /
    0. Comunicação e Dados Cedidos
    1. Proposta
    2. Fotos                 <- as fotos da app ficam aqui, uma pasta por divisão
    3. Fotos - Light         <- (a app já não usa esta pasta)
    4. Termografia
    5. Relatório
    6. Contabilidade e Correio
    7. Outros Dados
```

- **Processo** = pasta `<n.º> - <morada> - <cliente>`. O n.º (4 a 8 algarismos; os da empresa têm 6: ano + sequência)
  entra nos nomes dos ficheiros. A morada e o cliente aparecem na lista e no ecrã do processo. Ao criar um processo,
  os caracteres que o SharePoint não aceita em nomes de pastas (`" * : < > ? / \ | # %`) são trocados por `-`, e um
  " - " dentro da morada passa a vírgula (para não se confundir com o separador).
- **Fotos** em `<processo>/2. Fotos/<divisão>/` (original). Num prédio,
  com frações, a pasta da fração fica antes da divisão: `<processo>/2. Fotos/<fração>/<divisão>/`
  (a ordem das pastas está em `remoteFolderFor` / `remoteLightFolderFor`, em `src/naming.ts`).
  As pastas estão em `PHOTOS_SUBFOLDER` e `LIGHT_SUBFOLDER`, e o tamanho e a qualidade da versão leve em
  `LIGHT_BOX_LONG` (2500), `LIGHT_BOX_SHORT` (1875) e `LIGHT_JPEG_QUALITY` (0,9), tudo em `src/naming.ts`. As pastas das divisões criam-se sozinhas.
- Nome do ficheiro: `260098_20261103_143015_007_cozinha.jpg` = processo · data · hora · n.º de ordem no processo · divisão.
  Com fração, o nome dela vem antes da divisão: `260098_20261103_143100_008_fracao-a_cozinha.jpg`.
  O original mantém o formato que a câmara der. Os nomes são únicos,
  por isso repetir uma gravação nunca cria duplicados.
- Os processos de demonstração (`?demo`) têm nomes inventados, mas seguem esta mesma estrutura.

## Aspeto

Seguiu-se o relatório de exemplo: fundo claro, tipo leve, linhas finas castanho-acinzentadas,
barras cinzentas com o número a negrito ("9 Divisões"), bloco "Local / Fotos" com a linha vertical da capa
e a barra em gradiente do logótipo (castanho → vermelho → laranja → amarelo) no topo.
O logótipo e o tipo de letra do relatório **não** estão incluídos (não são nossos para reproduzir aqui).
A app usa Century Gothic / Avenir / Segoe UI / Roboto conforme o que o telemóvel tiver; para usar o tipo de letra
oficial, juntar o ficheiro em `public/` e declará-lo com `@font-face` em `src/styles.css`.
O cinzento das barras é um pouco mais escuro do que o do relatório, para o texto branco se ler ao sol.

## Ligar ao OneDrive (mais tarde)

Quando houver ligação, os processos passam a vir das pastas que já existem na biblioteca (deixa de ser preciso criá-los
à mão) e as fotos vão direto para lá.

1. **Pedir ao IT:** registo da app no Microsoft Entra (tipo *Single-page application*, com o endereço onde a app
   fica publicada como redirect URI), permissão `Sites.Selected` com acesso de escrita ao site dos processos,
   e uma pasta de teste na biblioteca.
2. **Login:** `@azure/msal-browser`, fluxo *authorization code + PKCE*, obtendo o token em silêncio antes de cada envio.
3. **Criar `src/storage/GraphProvider.ts`** a implementar `StorageProvider` (como o `LocalFolderProvider`, mas com `needsNetwork = true`):
   - `listProcesses`: percorrer `0. Processos/<ano>/<mês>/` (as 12 pastas dos meses em paralelo, para o ano em curso;
     em janeiro e fevereiro também o ano anterior) com `GET /drives/{drive-id}/root:/{pasta}:/children`, ficar só com as
     pastas cujo nome começa por um n.º (`processFromFolder`) e guardar a lista no telemóvel para abrir sem rede.
   - `uploadPhoto`: recebe a pasta de destino completa (`260098 - …/2. Fotos/Cozinha`) e cria-a se não existir.
     `PUT …:/content` até 4 MB; acima disso `createUploadSession` com blocos múltiplos de 320 KiB
     (as fotos de telemóvel quase sempre passam os 4 MB). Usar `conflictBehavior: replace`.
     A pasta do processo tem de ser procurada em `<ano>/<mês>/`: guardar no `Process` o caminho completo.
   - Erros: 429/503 e falhas de rede → erro normal (repete sozinho, respeitando `Retry-After`);
     401 → renovar o token e repetir; 403/404 → `new UploadError(msg, { retryable: false })`.
4. Em `src/storage/index.ts`, devolver o novo provider, com `folder: null` e `localProcesses: null`
   (o resto da app já trata esse caso, como na demonstração).

O service worker não intercepta pedidos a outros domínios, por isso não interfere com o login nem com o Graph.

## Limites conhecidos

- Testado num Chrome de computador com câmara simulada e um seletor de pastas simulado (processos, divisões, captura,
  original + versão leve nas pastas certas, sem rede, reiniciar a app, autorização que volta a ser pedida, abrir offline).
  **Falta testar num telemóvel real**: o seletor de pastas do Chrome para Android (autorizações, pastas aceites),
  a qualidade das fotos, a lanterna, a bateria, muitas fotos seguidas.
- O build do Vite não foi corrido durante o desenvolvimento (o `npm install` não tinha acesso ao registo);
  `npm install && npm run build` é o primeiro passo no teu computador.
- Os processos têm de ser criados à mão (n.º, morada, cliente). Ainda não há importação de uma lista, nem edição
  de um processo já criado (só remover, se ainda não tiver fotos).
- Remover um processo da lista **não apaga** as pastas nem as fotos já guardadas no telemóvel.
- As divisões extra ("Outra divisão") e as frações ficam guardadas no telemóvel, por processo. Uma fração só se
  remove enquanto não tiver fotos, e não há renomear (criar outra e, se for preciso, mover as pastas à mão).
- Ao abrir um processo com frações, a app mostra "Sem fração"; é preciso tocar na fração antes de fotografar.
  (Fica por decidir se deve lembrar a última fração usada.)
- Depois de guardada, a foto continua na app com uma miniatura e uma pré-visualização (cerca de 0,1 a 0,3 MB por foto).
  Ainda não há limpeza automática; é uma melhoria a fazer se a memória começar a pesar.
- O zoom foi testado só com câmaras simuladas. Num telemóvel real falta confirmar: que o 0,5× aparece (depende do
  modelo), e que a foto sai com o zoom escolhido (o Chrome tem de aplicar o zoom da imagem à foto tirada).
- Num computador, a qualidade depende da webcam (muitas só dão 720p). A resolução máxima vê-se num telemóvel.
- As fotos que ainda não foram para a pasta vivem no armazenamento do Chrome. A app pede ao Android que o proteja,
  mas se alguém limpar os "dados do site" perdem-se as que ainda não seguiram. As já guardadas na pasta não são afetadas.
- Ainda não há autenticação nem permissões por utilizador, e as fotos na pasta do telemóvel não estão cifradas
  (qualquer pessoa com acesso ao telemóvel desbloqueado vê-as).
- Só Android (iPhone fora de âmbito).

## Ideias para depois

- **Exportar um processo** (partilhar as pastas por e-mail, Drive ou cabo) para quem não puder escolher pasta.
- **Importar a lista de processos** (colar ou ficheiro CSV) para não os criar um a um.
- O relatório legenda cada foto ("Figura 12 – Fissura na parede da cozinha"). Um campo de legenda por foto,
  guardado junto ao ficheiro, permitiria juntar depois as fotos ao relatório já com as legendas.
