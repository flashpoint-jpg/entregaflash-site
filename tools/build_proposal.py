from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'proposta-entrega-flash-empresas.pdf'
FONT = Path('/usr/share/fonts/truetype/dejavu')
pdfmetrics.registerFont(TTFont('DejaVu', str(FONT/'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DejaVu-Bold', str(FONT/'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('DejaVu',normal='DejaVu',bold='DejaVu-Bold')
W,H = 595.276,841.89
INK=HexColor('#141B26'); ORANGE=HexColor('#FF9E24'); MUTED=HexColor('#4C596B'); RULE=HexColor('#DCE1E8')
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('Entrega Flash para Empresas - Proposta comercial')
c.setAuthor('Entrega Flash')
c.setSubject('Entregas sob demanda para empresas parceiras')
def para(text,x,y,width=499,size=11.2,color=INK,bold=False,leading=None):
    style=ParagraphStyle('p',fontName='DejaVu-Bold' if bold else 'DejaVu',fontSize=size,leading=leading or size*1.5,textColor=color,spaceAfter=0)
    p=Paragraph(text,style);_,h=p.wrap(width,1000);p.drawOn(c,x,y-h);return y-h
def rect(x,y,w,h,color,r=0):
    c.setFillColor(color);c.setStrokeColor(color)
    if r:c.roundRect(x,y,w,h,r,stroke=0,fill=1)
    else:c.rect(x,y,w,h,stroke=0,fill=1)
def footer(n):
    c.setStrokeColor(RULE);c.line(48,48,W-48,48)
    para('ENTREGA FLASH  •  PROPOSTA COMERCIAL',48,35,400,8.2,MUTED)
    para(f'{n} / 2',W-85,35,40,8.2,MUTED)
def step(n,title,text,y):
    rect(48,y-23,27,27,ORANGE,7);para(str(n),56,y-1,18,12,INK,True)
    para(title,90,y+4,455,12.2,INK,True);end=para(text,90,y-19,450,10.5,MUTED)
    return end-20

# Page 1: client-facing offer with a compact visual hierarchy.
rect(0,H-287,W,287,INK)
c.drawImage(str(ROOT/'entregaflash-logo-premium.png'),48,H-93,width=195,height=77,preserveAspectRatio=True,anchor='c',mask='auto')
para('PARCERIA PARA EMPRESAS',W-243,H-46,195,9.4,ORANGE,True)
para('Sua loja vende.',48,H-124,499,34,white,True,41)
para('A gente entrega.',48,H-167,499,34,ORANGE,True,41)
para('Entregas sob demanda para acompanhar a rotina do seu negócio.',48,H-224,470,12,HexColor('#DBE1E9'))
y=H-313
para('Chame quando precisar.',48,y,499,20,INK,True);y-=39
y=para('Conecte sua empresa a entregadores pelo Entrega Flash. Continue vendendo no balcão, pelo telefone, pelo WhatsApp ou pela internet e solicite o transporte pelo aplicativo.',48,y,499,11.4,MUTED)-22
rect(48,y-48,499,48,HexColor('#FFF1DC'),10)
para('CADASTRO GRATUITO  •  SEM MENSALIDADE',62,y-10,470,11,INK,True)
para('Para a empresa, o pagamento é por corrida solicitada.',62,y-28,470,9.7,MUTED)
y-=76
benefits=[('Agilidade para pedir','Retirada salva e opção de repetir pedidos, revisando o preço atualizado.'),('Controle das entregas','Painel com pedidos em andamento, histórico e valores do dia.'),('Mais de um destino','Até 10 endereços de entrega por corrida, com os adicionais informados.'),('Cliente informado','Link de acompanhamento e confirmação do recebimento por PIN.')]
for i,(title,text) in enumerate(benefits):
    col=i%2;row=i//2;x=48+col*261;yy=y-row*91
    rect(x,yy-62,4,62,ORANGE)
    para(title,x+14,yy,227,12,INK,True)
    para(text,x+14,yy-24,224,10.4,MUTED)
y-=197
para('Para o comércio e os serviços da sua cidade',48,y,499,13,INK,True)
para('Farmácias • Mercados • Restaurantes • Lojas • Pet shops<br/>Autopeças • Floriculturas • Outros negócios',48,y-27,499,10.6,MUTED)
footer(1);c.showPage()

# Page 2: conditions correspond to the running wallet and delivery flow.
rect(0,H-12,W,12,ORANGE)
para('ENTREGA FLASH PARA EMPRESAS',48,H-45,499,10,MUTED,True)
para('Uma parceria simples\nde começar.'.replace('\n','<br/>'),48,H-76,499,27,INK,True,34)
y=H-164
y=step(1,'Cadastre sua empresa','Informe o estabelecimento, responsável, WhatsApp, cidade e endereço de retirada. Não pedimos CNPJ nem documentos na primeira etapa.',y)
y=step(2,'Organize a primeira entrega','Entre ou crie sua conta, confirme os dados da empresa e informe os destinos, o veículo e os detalhes do envio.',y)
y=step(3,'Confira o valor e solicite','Adicione saldo via Pix, confirme a corrida e acompanhe após o aceite. O destinatário pode abrir o link sem instalar o aplicativo.',y)
y-=1
para('Condições comerciais e operacionais',48,y,499,15,INK,True);y-=31
terms=[('Modelo','Cadastro gratuito e sem mensalidade para a empresa. Pagamento por corrida.'),('Preço','Calculado antes da confirmação, conforme distância, veículo, paradas e serviços selecionados.'),('Pagamento','Saldo na carteira Entrega Flash, adicionado via Pix e utilizado na confirmação do pedido.'),('Disponibilidade','Atendimento conforme região, veículo e entregadores disponíveis. O cadastro não garante aceite imediato.'),('Envio e adicionais','A empresa prepara a mercadoria e informa os endereços. Espera, extras e cancelamento seguem as regras exibidas no app.')]
for label,text in terms:
    end=para(text,167,y,375,10.1,MUTED,leading=14.4)
    para(label,48,y,108,10.4,INK,True)
    y=end-12;c.setStrokeColor(RULE);c.line(48,y+5,W-48,y+5)
y-=11
boxh=105;rect(48,y-boxh,499,boxh,INK,12)
para('Vamos organizar suas entregas?',65,y-14,355,14.2,white,True)
para('Cadastre sua empresa e consulte atendimento\nna sua cidade.'.replace('\n','<br/>'),65,y-42,340,10.4,HexColor('#DBE1E9'))
para('<link href="https://www.entregaflash.app.br/empresas" color="#FFB65A">entregaflash.app.br/empresas</link>',65,y-79,355,10.5,ORANGE,True)
q=QrCodeWidget('https://www.entregaflash.app.br/empresas');b=q.getBounds();sz=75;drawing=Drawing(sz,sz,transform=[sz/(b[2]-b[0]),0,0,sz/(b[3]-b[1]),0,0]);drawing.add(q)
rect(W-139,y-89,77,77,white,3);renderPDF.draw(drawing,c,W-138,y-88)
if y-boxh<60:raise RuntimeError('Proposal content overlaps footer')
footer(2);c.save();print(OUT)
