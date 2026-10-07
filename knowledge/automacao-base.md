# BASE TÉCNICA DE AUTOMAÇÃO INDUSTRIAL (v1, pesquisa de out/2026)

> Como usar: este documento é a base técnica inicial do agente. Itens marcados com **(confirmar)** são práticas ou valores que variam por modelo/firmware e devem ser repassados ao usuário com o aviso de conferir no manual. Dados de versões de software refletem a pesquisa feita em outubro de 2026 e podem ter mudado: na dúvida, confirme na web em fonte oficial.

---

## PARTE 1. FUNDAMENTOS (valem para qualquer marca)

### 1.1 O que é um CLP e como ele trabalha
- CLP (PLC) é um computador industrial robusto que lê entradas, executa um programa e comanda saídas.
- **Ciclo de varredura (scan):** (1) lê as entradas e copia para a memória de imagem; (2) executa o programa; (3) atualiza as saídas. Consequência prática: uma entrada que muda e volta dentro de um único ciclo pode ser perdida; para sinais rápidos use entradas de alta velocidade, interrupções ou contadores rápidos.
- Partes: CPU, fonte, módulos de entrada digital (DI), saída digital (DO), entrada analógica (AI), saída analógica (AO), módulos de comunicação.
- Modelos **compactos** (E/S na própria CPU, mais baratos, ideais para máquinas pequenas) x **modulares** (rack/backplane, expansíveis, para sistemas maiores).

### 1.2 Linguagens da norma IEC 61131-3
- **LD (Ladder):** diagrama de contatos, a mais usada no Brasil por vir dos comandos elétricos.
- **FBD:** diagrama de blocos de função.
- **ST (Texto Estruturado):** linguagem textual parecida com Pascal, ótima para cálculos, laços e lógica complexa.
- **IL (Lista de Instruções):** textual de baixo nível, em desuso.
- **SFC/Grafcet:** diagrama sequencial de funções, ótimo para sequências de máquina.
- Boa prática: sequências em SFC ou máquina de estados; intertravamentos e comandos simples em ladder; cálculos em ST.

### 1.3 Entradas e saídas digitais
- Tensão típica de campo: 24 Vcc. Evite misturar 24 Vcc de comando com 110/220 Vca no mesmo módulo.
- **Sensores PNP x NPN:** PNP (source) fornece +24 V à entrada quando atua; NPN (sink) leva a entrada ao 0 V. O módulo de entrada do CLP precisa ser compatível (entrada "sink" ou "source"). Em dúvida, consulte o manual do módulo e o datasheet do sensor.
- **Saída a relé:** serve para cargas CA e CC dentro da corrente nominal, isolada, mais lenta e com desgaste mecânico. Não use para chaveamento rápido (PWM, pulsos).
- **Saída a transistor:** rápida, só CC, corrente baixa por ponto (verificar no manual). Para cargas maiores use relé de interface ou contator.
- **Cargas indutivas** (contatores, solenoides, relés): use diodo de roda livre (CC) ou supressor RC/varistor (CA) para proteger a saída.
- Reserve cerca de 20% de pontos de E/S livres para expansão.

### 1.4 Sinais analógicos
- **4-20 mA:** o mais usado na indústria. Vantagens: menos sensível a ruído, permite detectar fio rompido (leitura abaixo de ~4 mA), longas distâncias.
- **0-10 V:** comum em inversores e potenciômetros, sensível a ruído e queda em cabos longos.
- **PT100/termopar:** use módulo específico ou transmissor de temperatura (4-20 mA).
- Use **cabo blindado**, aterre a malha em **um só ponto**, separe do cabo de potência.
- **Escalonamento:** converte o valor bruto do módulo em unidade de engenharia. Fórmula linear: `Valor = Min + (Bruto - BrutoMin) * (Max - Min) / (BrutoMax - BrutoMin)`. A faixa bruta depende do CLP (por ex., 0 a 27648 em Siemens para 4-20 mA/0-10 V, **confirmar** no manual do módulo).

### 1.5 Blocos lógicos básicos
- **Selo (auto-retenção):** botão liga em paralelo com contato da própria saída, em série com botão desliga (NF) e proteções. Em parada, prefira lógica que corta a saída com contato NF.
- **Temporizadores:** TON (atraso para ligar), TOF (atraso para desligar), TP (pulso). Nome e sintaxe mudam por marca.
- **Contadores:** CTU (crescente), CTD (decrescente), CTUD. Sempre preveja o reset.
- **Detecção de borda (subida/descida):** gera pulso de um ciclo, usada para evitar que um botão pressionado seja contado várias vezes.
- **Intertravamento:** impede acionamentos conflitantes (por exemplo, avançar e recuar o mesmo cilindro, ou motor para frente e para trás ao mesmo tempo).
- **Parada de emergência:** o botão de emergência corta a energia de potência por **hardware** (relé de segurança), e o CLP apenas monitora o estado.

### 1.5.1 Estrutura mínima de um programa de máquina
Sugira organizar em blocos separados: (1) tratamento de entradas e escalonamento, (2) modos de operação (manual/automático), (3) sequência, (4) intertravamentos, (5) comandos de saída, (6) alarmes/falhas, (7) comunicação com IHM.

### 1.6 Partidas de motores trifásicos
- **Partida direta:** simples, corrente de partida alta (típico 6 a 8 vezes a nominal). Indicada para motores pequenos e rede forte.
- **Estrela-triângulo:** reduz a corrente de partida, exige motor com ligação em 6 terminais e tensão de triângulo igual à da rede. Pouco indicada para cargas de alto conjugado na partida.
- **Soft-starter:** rampa de tensão na partida e parada, só controla partida/parada suave, sem controle de velocidade em regime.
- **Inversor de frequência:** varia velocidade (frequência), com rampas, proteção do motor e comunicação. Escolha pela corrente nominal do motor, não só pela potência.
- **Servo:** controle preciso de posição, velocidade e torque, exige servo-motor e servo-drive compatíveis, com realimentação (encoder).
- Proteções típicas: disjuntor-motor ou fusível+relé térmico, contator, e proteção contra falta de fase quando houver risco.

### 1.7 Inversores de frequência (conceitos)
- Parâmetros típicos que o usuário precisa configurar: dados de placa do motor (tensão, corrente, frequência, rotação, potência), **rampa de aceleração e desaceleração**, frequência mínima e máxima, origem do comando (teclado, bornes, comunicação) e origem da referência (potenciômetro, entrada analógica, comunicação).
- Rampas muito curtas causam alarmes de sobrecorrente ou sobretensão na frenagem; nesse caso pode ser necessário aumentar a rampa de desaceleração ou usar resistor de frenagem.
- Cabo blindado entre inversor e motor, com a malha aterrada nas duas pontas, e separação dos cabos de sinal.
- Função **STO (Safe Torque Off)** disponível em muitos inversores e servos é componente de segurança e deve ser usada com relé de segurança.
- Os **números dos parâmetros mudam por marca e série**. Nunca informe um número de parâmetro sem confirmar o modelo e o manual.

### 1.7.1 Servo acionamento (conceitos)
- Componentes: servo-motor com encoder, servo-drive, cabos de potência e de realimentação, e controlador (CLP com saída de pulso, rede de movimento, ou controle de posição interno do drive).
- Modos de controle: posição, velocidade e torque.
- Dimensionamento exige conhecer carga, inércia refletida, perfil de movimento e relação de transmissão.

### 1.8 Redes e protocolos industriais
- **Modbus RTU:** serial RS-485 (ou RS-232), mestre/escravo, simples e universal. Parâmetros: velocidade (baud rate), paridade, bits de parada, endereço do escravo. Todos os equipamentos no mesmo barramento devem ter as mesmas configurações de comunicação e endereços diferentes. Terminação de 120 ohms nas pontas do barramento RS-485.
- **Modbus TCP:** Modbus sobre Ethernet, porta 502.
- **PROFINET (Siemens):** Ethernet industrial. Cada dispositivo precisa de nome PROFINET e endereço IP.
- **EtherNet/IP (Rockwell):** Ethernet industrial baseada em CIP.
- **PROFIBUS, CANopen, DeviceNet:** redes de campo mais antigas, ainda presentes em plantas existentes.
- **OPC UA:** padrão de interoperabilidade para integração com supervisórios, MES e nuvem.
- Endereçamento Modbus: a numeração "base 0" e "base 1" costuma causar erro de deslocamento de 1; confira como o equipamento documenta o endereço.

### 1.9 PID (controle de processo)
- Controla uma variável (temperatura, pressão, nível, vazão) comparando setpoint (SP) e variável de processo (PV), gerando saída de controle (CV).
- **P** responde ao erro atual, **I** elimina erro residual, **D** antecipa variações.
- Método prático de ajuste: começar só com P, aumentar até oscilar, reduzir um pouco, depois adicionar I aos poucos e D só se necessário. Respeitar limites de saída e anti-windup.
- Em muitos CLPs existe bloco PID pronto com ajuste automático (autotune).

### 1.10 Encoder e contagem rápida
- **Encoder incremental:** gera pulsos por rotação (canais A, B e opcionalmente Z). Dois canais defasados permitem detectar sentido.
- A leitura precisa de **entrada de contador rápido (HSC)** ou módulo próprio, pois o ciclo normal não acompanha a frequência.
- Cálculo de distância: `distância = (pulsos / pulsos por volta) * avanço por volta`.

### 1.11 IHM (Interface Homem-Máquina)
- Boas práticas: telas simples e claras, cores com significado (vermelho = alarme/parada, verde = ok/funcionando), poucas informações por tela, botões grandes, navegação previsível, **nível de acesso** (operador, manutenção, administrador), tela de alarmes com histórico e reconhecimento.
- Comunicação IHM-CLP: driver nativo da marca ou Modbus. Configure endereços, velocidade e número de estação iguais nos dois lados.
- Separe **tags de comando** (IHM escreve no CLP) de **tags de status** (CLP informa à IHM) para evitar conflitos de escrita.

### 1.12 Supervisório (SCADA)
- Funções: telas gráficas, alarmes e eventos, histórico/tendências, relatórios, receitas, comunicação com vários CLPs. Exemplos no mercado: Elipse E3 (ensinado na Treinar), WinCC, FactoryTalk, Ignition.

### 1.13 Segurança de máquinas e elétrica
- **NR-10:** segurança em instalações e serviços com eletricidade (desenergização, bloqueio e etiquetagem, EPI, habilitação).
- **NR-12:** segurança em máquinas e equipamentos (proteções, dispositivos de parada de emergência, sistemas de segurança).
- Categorias e níveis de desempenho de segurança (ISO 13849, com PL de "a" até "e") e SIL (IEC 62061) orientam a escolha de componentes de segurança.
- Componentes: botão de emergência, relé de segurança, cortina de luz, chave de intertravamento com monitoramento, CLP de segurança, módulos com STO.
- Funções de segurança **nunca** devem depender só de programa em CLP padrão.

### 1.14 Diagnóstico de falhas (roteiro universal)
1. **Segurança primeiro:** desenergizar, bloquear, verificar ausência de tensão antes de qualquer intervenção.
2. Alimentação: tensão da fonte 24 V, disjuntores, fusíveis.
3. Estado do CLP: LEDs (RUN, STOP, ERROR/FAULT), modo de operação, diagnóstico no software.
4. Entradas: o LED do ponto acende quando o sensor atua? Se o LED acende e o programa não vê, o problema é no programa/endereço; se não acende, é sensor, cabo ou alimentação.
5. Saídas: o LED da saída acende e a carga não aciona? Verifique fusível, relé de interface, contator, fiação.
6. Comunicação: endereços, velocidade, paridade, terminação, cabo, IP e máscara, versão de firmware.
7. Programa: online/monitoração, forçamento só em manutenção controlada e removido ao final.
8. Compare com a última versão que funcionava (backup).

### 1.15 Orçamento de projeto de automação (estrutura)
- Materiais: CLP e módulos, IHM, inversores/soft-starters/servos, sensores, atuadores, componentes de painel (disjuntores, contatores, relés, fontes, bornes, canaletas, cabos), quadro/painel, ferramentas.
- Serviços: engenharia/projeto elétrico, montagem de painel, programação de CLP e IHM, instalação em campo, comissionamento, documentação.
- Nunca apresente preço sem fonte ou data. Use faixa e sempre informe que se trata de estimativa.

---

## PARTE 2. SIEMENS (SIMATIC, TIA Portal)

### 2.1 Famílias
- **LOGO!:** microcontrolador lógico para aplicações simples, programado no LOGO!Soft Comfort.
- **S7-1200:** compacto, para máquinas pequenas e médias. CPUs 1211C, 1212C, 1214C, 1215C, 1217C. Variações por tipo de alimentação/entrada/saída (ex.: **DC/DC/DC** = alimentação DC, entradas DC, saídas transistor; **DC/DC/Rly** e **AC/DC/Rly** = saídas a relé). Módulos de sinal (SM), placas de sinal (SB), módulos de comunicação (CM).
- **S7-1200 G2:** nova geração do S7-1200, lançada junto com o **TIA Portal V20** (fim de 2024). Mais potente e compacta, com mais recursos de movimento e comunicação. Confirme CPUs disponíveis e requisitos de versão no site da Siemens.
- **S7-1500:** média/alta performance. CPUs 1511, 1513, 1515, 1516, 1517, 1518; versões compactas (1511C, 1512C), de tecnologia (T), de segurança (F). Módulos de E/S modulares.
- **S7-300/400:** linhas legadas (programadas em STEP 7 Classic V5.x ou com limitações no TIA). Confirme o status de ciclo de vida/descontinuação com a Siemens ao projetar algo novo.
- **ET 200 (SP, MP, S):** E/S remotas via PROFINET.

### 2.2 TIA Portal
- Ambiente único para CLP (STEP 7), IHM (WinCC), acionamentos (Startdrive) e rede.
- Versões: V17 (2021), V18 (2022), V19 (2023), **V20 (2024)**, **V21 (anunciada em novembro de 2025)**. A V21 trouxe integração com Git para controle de versão, novo editor do WinCC Unified, licenciamento por assinatura, entre outros. **Confirme a versão atual e os requisitos na Siemens.**
- Regras de compatibilidade: projetos mais antigos podem ser atualizados para versão mais nova, mas **não abrem em versão mais antiga**. Cada CPU/firmware exige uma versão mínima do TIA Portal.
- Simulação: **S7-PLCSIM** (S7-1200/1500) e **S7-PLCSIM Advanced** (S7-1500 e outros), úteis para testar sem hardware.

### 2.3 Estrutura de programa
- **OB (Organization Block):** OB1 é o ciclo principal. OB100 executa na partida (STARTUP). OB30 a OB38 são interrupções cíclicas. Existem OBs de diagnóstico e de erro (por ex., OB82, OB86, OB121, OB122) **(confirmar usos no manual da CPU)**.
- **FC (Function):** sem memória própria. **FB (Function Block):** com memória (DB de instância). **DB (Data Block):** dados globais. **UDT (PLC data type):** tipo de dado definido pelo usuário.
- Acesso otimizado a blocos (padrão em S7-1200/1500): você usa nomes simbólicos (tags) em vez de endereços absolutos.
- Boa prática: um FB por equipamento (motor, válvula, cilindro), com instâncias para cada unidade; padronizar nomes das tags.

### 2.4 Endereçamento e tipos de dados
- Entradas `%I0.0`, saídas `%Q0.0`, memórias `%M0.0`, palavras `%MW`, entradas analógicas `%IW`, saídas analógicas `%QW`. Os endereços de E/S dos módulos aparecem na configuração de dispositivos **(confirmar endereços iniciais, por ex., entradas analógicas onboard do S7-1200 normalmente a partir de %IW64)**.
- Tipos: Bool, Byte, Word, DWord, Int, DInt, Real, Time, String, Array, Struct.
- Tempo: formato `T#5s`, `T#500ms`.

### 2.5 Instruções principais
- Contatos e bobinas (NA, NF, bobina, set/reset), detecção de borda (P_TRIG, N_TRIG ou contatos de borda).
- Temporizadores IEC: **TON, TOF, TP, TONR**, normalmente com DB de instância ou multi-instância.
- Contadores: **CTU, CTD, CTUD**.
- Matemática e movimentação: ADD, SUB, MUL, DIV, MOVE, CONVERT; comparadores.
- **Escalonamento analógico:** **NORM_X** e **SCALE_X**. A faixa nominal dos módulos analógicos é 0 a 27648 **(confirmar no manual do módulo)**.
- **PID:** objetos de tecnologia **PID_Compact** (S7-1200/1500) com autotune.
- **SCL:** Texto Estruturado do TIA Portal.

### 2.6 Comunicação
- **PROFINET:** atribuir **nome do dispositivo** e **endereço IP** a cada nó; erro comum é nome de dispositivo não atribuído. Dispositivos IO precisam estar na mesma sub-rede.
- **S7 (PUT/GET):** comunicação entre CPUs, precisa habilitar "permitir acesso via PUT/GET" na CPU servidora **(confirmar segurança do projeto)**.
- **Open User Communication (TCP/UDP):** blocos TSEND_C, TRCV_C.
- **Modbus TCP:** blocos MB_CLIENT e MB_SERVER. **Modbus RTU:** módulo CM 1241 (RS-485) ou placa CB 1241 e blocos MB_COMM_LOAD, MB_MASTER, MB_SLAVE.
- **OPC UA:** disponível em CPUs recentes (S7-1500, S7-1200 G2), exige licença em alguns casos **(confirmar)**.
- Segurança: use as proteções de acesso da CPU (senhas, níveis de acesso).

### 2.7 Movimento
- Saídas de pulso (PTO) em S7-1200 de saída a transistor, ou controle via PROFINET/PROFIdrive com SINAMICS.
- Blocos de movimento **PLCopen** (MC_Power, MC_Home, MC_MoveAbsolute, MC_MoveRelative, MC_MoveVelocity etc.) com objetos de tecnologia (eixo).

### 2.8 IHM Siemens
- **Basic Panels** (KTP400/700/900/1200 Basic) programados em WinCC (Basic) no TIA Portal, **Comfort Panels** (TP/KP), **WinCC Unified** (mais novo, base web). A escolha depende de recursos exigidos e do CLP.
- Comunicação com S7-1200/1500: via PROFINET com tags do CLP importadas pelo TIA Portal (conexão integrada).

### 2.9 Acionamentos Siemens
- **SINAMICS V20** (inversor simples), **SINAMICS G120** (modular, comunicação PROFINET), Startdrive no TIA Portal para parametrização. Telegramas padrão (por ex., telegrama 1 para velocidade) **(confirmar o telegrama certo para cada aplicação)**.

### 2.10 Fontes oficiais
- Siemens Industry Online Support (support.industry.siemens.com), sites e manuais da Siemens do Brasil e global.

---

## PARTE 3. ROCKWELL AUTOMATION / ALLEN-BRADLEY

### 3.1 Famílias
- **ControlLogix (1756):** alto desempenho, modular. Linhas **5570** (1756-L7x, anterior) e **5580** (1756-L8x, atual). Também **GuardLogix** (segurança).
- **CompactLogix:** **5370** (1769-L3x) e **5380** (5069-L3xx), para médio porte.
- **Micro800** (Micro820/830/850/870, programação no **Connected Components Workbench, CCW**), **MicroLogix** e **SLC 500** (programados no RSLogix 500, linhas legadas), **PLC-5** (legado).
- E/S: 1756 (no chassi do ControlLogix), **Point I/O (1734)**, **Flex 5000 (5094)**, **Compact 5000 I/O (5069)**.

### 3.2 Software
- **Studio 5000 Logix Designer** programa a família Logix 5000 (ControlLogix, CompactLogix, GuardLogix). Versão mais recente identificada na pesquisa: **v38.02 (notas de versão de julho de 2026)**. **Confirme a versão atual no site da Rockwell.**
- **Compatibilidade:** a versão **maior** do firmware do controlador deve corresponder à versão do Logix Designer usada para o projeto. Use o **PCDC (Product Compatibility and Download Center)** da Rockwell para verificar compatibilidade e baixar firmware. Atualização de firmware pelo **ControlFLASH**.
- **Studio 5000 Logix Emulate:** emulador para testar a lógica sem hardware.
- Comunicação do software com o controlador: **FactoryTalk Linx** ou **RSLinx Classic** (driver Ethernet/serial), "Who Active" para escolher o caminho.

### 3.3 Modelo de programação baseado em tags
- Não existem endereços fixos como `I:0/0`. Tudo é **tag** simbólica (nome). E/S tem tags geradas pelo módulo (ex.: `Local:1:I.Data[0]`, nomes variam por tipo de módulo) **(confirmar na configuração de E/S do projeto)**.
- Estrutura: **Controller > Tasks (contínua, periódica, evento) > Programs > Routines** (a rotina principal chama as demais).
- **Escopo de tags:** de controlador (visíveis por todos os programas) ou de programa (locais).
- **Alias tags** para dar nomes funcionais a pontos de E/S.
- **UDT (User-Defined Types)** e **Add-On Instructions (AOI)** para criar blocos reutilizáveis (por ex., AOI de motor ou válvula).
- **Produced/Consumed tags** e instrução **MSG** para troca de dados entre controladores.
- Linguagens: Ladder, Function Block, Structured Text, SFC.

### 3.4 Tipos de dados e instruções
- Tipos: **BOOL, SINT, INT, DINT** (inteiro nativo de 32 bits, preferido), **LINT, REAL, STRING**, arrays e estruturas.
- Instruções básicas: **XIC** (contato NA), **XIO** (contato NF), **OTE** (bobina), **OTL/OTU** (latch/unlatch), **ONS** (borda de subida em um ciclo).
- **Temporizadores:** TON, TOF, RTO com a estrutura **TIMER** (.PRE preset em **milissegundos**, .ACC acumulado, .EN, .TT, .DN). **Contadores:** CTU, CTD, com estrutura **COUNTER** (.PRE, .ACC, .CU, .CD, .DN, .OV, .UN) e **RES** para reset.
- Comparação e matemática: EQU, NEQ, GRT, GEQ, LES, LEQ, LIM, ADD, SUB, MUL, DIV, **CPT** (cálculo livre), MOV, COP, **SCL** (escalonamento), PID/PIDE (controle de processo).
- Falhas: tipos de falha maior (major fault) e menor, a visualização na **Controller Properties > Major Faults**. Modos do controlador: RUN, PROGRAM, REMOTE.

### 3.5 Comunicação
- **EtherNet/IP** (padrão): endereço IP por **BootP/DHCP** ou configuração direta, módulos de comunicação como **1756-EN2T, EN2TR, EN4TR**.
- E/S remotas via EtherNet/IP, adicionadas na **I/O Configuration** do projeto.
- **Modbus**: via módulos/gateways ou, em CompactLogix/Micro800, bibliotecas e instruções específicas **(confirmar suporte do modelo)**.

### 3.6 IHM e supervisório
- **PanelView Plus 7** e **PanelView 800**: programados em **FactoryTalk View Studio (ME)** e **CCW**, respectivamente.
- **PanelView 5000**: **Studio 5000 View Designer**.
- **FactoryTalk View SE (supervisório)** para sistemas maiores.

### 3.7 Acionamentos e movimento
- **PowerFlex 525** (CA compacto, muito comum), **PowerFlex 755**, e servos **Kinetix**. Integração por perfis de dispositivo (Add-On Profiles) via EtherNet/IP.

### 3.8 Fontes oficiais
- rockwellautomation.com (Literature Library e Knowledgebase), compatibility.rockwellautomation.com (PCDC).

---

## PARTE 4. SCHNEIDER ELECTRIC

### 4.1 Famílias
- **Modicon M221** (referências TM221...): compacto, programado no **EcoStruxure Machine Expert Basic**, **software gratuito**, com **Ladder e Lista de Instruções** (segundo o FAQ da Schneider). Variações: **C** (compacto), **CE** (com Ethernet), saídas **R** (relé), **T** (transistor sink), **U** (transistor source) **(confirmar na referência exata)**.
- **Modicon M241, M251, M262:** programados no **EcoStruxure Machine Expert** (software com **licença**, suporta todas as linguagens IEC 61131-3, base CODESYS). Para máquinas mais exigentes, com mais comunicação e funções.
- **Módulos de expansão TM3** (DI, DO, AI, AO, especiais) para as famílias M221/M241/M251.
- **Modicon M340 e M580:** controladores de processo/PAC maiores, programados no **EcoStruxure Control Expert** (antigo Unity Pro).
- Antigos nomes: **SoMachine / SoMachine Basic** (hoje Machine Expert / Machine Expert Basic).

### 4.2 Machine Expert Basic (M221): pontos práticos
- Fluxo do projeto: Configuração de hardware, Programação, Display/HMI (para telas remotas), Comissionamento (transferência e firmware).
- Endereçamento clássico: entradas `%I0.0`, saídas `%Q0.0`, bits de memória `%M0`, palavras `%MW0`, constantes `%KW`, analógicas `%IW`. Temporizadores `%TM0` e contadores `%C0` **(confirmar sintaxe da versão em uso)**.
- Bits de sistema úteis: `%S0` (partida a frio), `%S1` (partida a quente), `%S13` (primeiro ciclo em RUN) **(confirmar no manual do M221)**.
- **Atualização de firmware** do M221 feita pelo software, com cabo micro-USB, na aba de comissionamento.
- Comunicação nativa: **Modbus RTU (serial)** e **Modbus TCP (Ethernet)** nos modelos com porta.

### 4.3 Machine Expert (M241/M251/M262)
- Programação baseada em **variáveis simbólicas** e endereços tipo `%IX0.0`, `%QX0.0`.
- Blocos de função de biblioteca para movimento, PID, comunicação.
- Opção de visualização web embarcada (Webvisu) e **Vijeo Designer** embutido para IHM Harmony **(confirmar na versão atual)**.

### 4.4 IHM Schneider (Harmony)
- Linhas Harmony (antes Magelis), programadas em **Vijeo Designer** ou **EcoStruxure Operator Terminal Expert**, dependendo do modelo **(confirmar a ferramenta correta para a série)**.

### 4.5 Acionamentos Schneider
- **Altivar** (ATV320 para máquinas, ATV340, ATV630/930/650/950 para processo). Configuração por teclado ou **SoMove**.

### 4.6 Fontes oficiais
- se.com (Schneider Electric), seção de downloads e documentos (por exemplo, M221 Programming Guide, referência EIO0000003297).

---

## PARTE 5. DELTA ELECTRONICS

### 5.1 Famílias de CLP
- **Série DVP:** linha muito difundida no Brasil. Modelos: SS2, SA2, SX2, SV2, ES2, EX2, EH3, ES3/EX3/SV3/SX3 e outros. Custo-benefício alto, para máquinas pequenas e médias.
- **Série AS (AS200, AS300):** nova geração, mais capacidade e comunicação.
- **Série AH500:** modular, para aplicações maiores.
- **Série AX:** mais recente, com foco em movimento e Ethernet industrial.
- Variações de saída: **R** (relé) e **T** (transistor); alimentação 24 Vcc ou 100-240 Vca conforme o modelo **(confirmar na referência)**.

### 5.2 Softwares Delta (pesquisa de out/2026)
- **WPLSoft:** software clássico para a família **DVP** (Ladder e Lista de Instruções). Versão vista na pesquisa: V2.52.
- **ISPSoft:** ambiente **IEC 61131-3** (Ladder, FBD, ST, SFC, IL) para **DVP, AS e AH500**. Versão vista na pesquisa: V3.19.
- **COMMGR:** utilitário de comunicação entre software e CLP (USB, RS-232, RS-485 ou Ethernet).
- **DIAStudio:** plataforma integrada mais recente da Delta para o ecossistema (de seleção de produto a programação), que cobre CLPs das séries **AS, AX e DVP-ES3/EX3/SV3/SX3** e IHMs **DOP-100, TP e outras**. **DIADesigner-AX:** ambiente para a série AX.
- **DOPSoft:** software de edição das IHMs **DOP-100** (ex.: DOP-107BV). **TPEditor:** para IHMs da série **TP**.
- **Confirme as versões mais novas no portal de downloads da Delta.**

### 5.3 Endereçamento clássico DVP (WPLSoft)
- **X** entradas e **Y** saídas, numeradas em **octal** (X0 a X7, depois X10 a X17; mesma regra para Y).
- **M** relés auxiliares, **S** passos (sequência), **T** temporizadores, **C** contadores, **D** registradores de dados (16 bits), **E/F** registradores de índice.
- Relés especiais úteis em DVP **(confirmar no manual do modelo)**: `M1000` ligado durante RUN, `M1002` pulso no primeiro ciclo em RUN, `M1011` clock de 10 ms, `M1012` 100 ms, `M1013` 1 s, `M1014` 1 min.
- Instruções básicas (lista de instruções): `LD`, `LDI`, `AND`, `ANI`, `OR`, `ORI`, `OUT`, `SET`, `RST`, `MOV`, `TMR`, `CNT`.
- **Temporizador:** `TMR T0 K50`; a base de tempo depende da faixa do temporizador (por exemplo, 100 ms em faixas comuns e 10 ms em outras) **(confirmar a tabela de T no manual)**.

### 5.4 Comunicação Modbus (DVP)
- Portas seriais: tipicamente COM1 RS-232 e COM2 RS-485 em modelos como DVP-SS2/SA2 **(confirmar no manual)**.
- Endereço Modbus de registradores em DVP (base 0): **D0 = 0x1000 (4096)** e **M0 = 0x0800 (2048)** **(confirmar no manual)**. Em tabelas de 6 dígitos é comum somar 1 (ex.: D0 como 404097).
- Parâmetros de comunicação do CLP são configurados em registradores especiais (por exemplo, **D1120** para formato da COM2, **D1121** para o endereço da estação, **M1143** para escolha RTU/ASCII) **(confirmar para o modelo exato, pois variam entre séries)**. Também é possível configurar pelo software em algumas séries.
- Erro comum: IHM Delta configurada como mestre Modbus RTU com **número de estação** diferente do CLP, ou velocidade/paridade divergentes.

### 5.5 IHM Delta
- **DOP-100**: configure o **driver/protocolo do CLP** (Delta DVP, Modbus RTU ou Modbus TCP), velocidade, formato, endereço da estação; o IHM funciona como **mestre** da rede.
- Alarmes no DOPSoft dependem de configuração correta de **modo de disparo, bit/palavra e endereço inicial**.
- Atualização de firmware da IHM pelo DOPSoft quando há erro de boot.

### 5.6 Inversores e servos Delta
- Inversores: **VFD-EL, MS300, C2000+, CP2000, CH2000, MH300**. Alguns possuem **PLC embutido**, programado em **WPLSoft/ISPSoft**.
- Servos: séries **ASDA-A2, A3, B2, B3**.
- Parâmetros de inversores e servos seguem numeração própria da Delta (por ex., grupos Pxx-xx); **sempre confirme o número no manual do modelo**.

### 5.7 Fontes oficiais
- Site e portal de downloads da Delta Electronics (deltaww.com e portais regionais, incluindo documentação e softwares).

---

## PARTE 6. COMPARATIVO RÁPIDO PARA ESCOLHA DE PLATAFORMA

| Critério | Siemens | Rockwell | Schneider | Delta |
|---|---|---|---|---|
| Faixa típica | S7-1200 a S7-1500 | CompactLogix a ControlLogix | M221 a M580 | DVP, AS, AH, AX |
| Software | TIA Portal (licença) | Studio 5000 (licença) | Machine Expert Basic (grátis, M221); Machine Expert/Control Expert (licença) | WPLSoft/ISPSoft/DIAStudio (download gratuito, **confirmar**) |
| Forte em | Indústria geral, automotiva, processos | Indústria norte-americana, grandes plantas | Máquinas OEM, edificações, energia | Custo-benefício, máquinas pequenas/médias |
| Modelo de endereço | Absoluto/simbólico (%I, %Q, tags) | Tags simbólicas | %I/%Q + variáveis | X/Y/M/D (DVP) |
| Rede principal | PROFINET | EtherNet/IP | Modbus/Ethernet, CANopen | Modbus, Ethernet |

> Use esta tabela só como orientação inicial. A escolha final depende de orçamento, disponibilidade local, padrão da planta e suporte técnico.

---

## PARTE 7. ESPAÇO PARA NOVOS CONTEÚDOS

Adicione abaixo, no mesmo formato, novos temas que quiser que o agente domine (manuais resumidos, procedimentos da Treinar, exemplos de programas, FAQs de alunos). Sugestão de formato:

```
### [Tema]
- Contexto / quando usar:
- Passo a passo ou regra:
- Exemplos:
- Erros comuns:
- Fonte (curso, aula ou manual oficial):
```

Ideias de módulos futuros: lógica de exemplo (ST e ladder) para esteira, tanque com nível, partida estrela-triângulo, controle de cilindros; checklist de comissionamento; guia de dimensionamento de inversor; parametrização por marca de inversor (WEG, Delta, Siemens, Schneider); servo e CNC; sistemas de pesagem; exercícios do curso TOP 10 (resumo).
