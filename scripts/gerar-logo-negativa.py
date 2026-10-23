#!/usr/bin/env python3
"""Gera a versão negativa da logo, para uso sobre fundo escuro.

O arquivo que a loja forneceu é todo preto sobre transparência, com as listras
em vermelho. Sobre o fundo escuro do site ele sumiria, e era por isso que o
cabeçalho precisava de uma placa branca atrás da marca. Aqui o preto vira claro
e o vermelho permanece, preservando o alfa original — é o alfa que mantém a
suavização das bordas.

Uso:
    python3 scripts/gerar-logo-negativa.py
    python3 scripts/gerar-logo-negativa.py --verificar-apenas <arquivo>
"""
import pathlib
import sys

from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / 'public' / 'logo-liberato.png'
DESTINO = RAIZ / 'public' / 'logo-liberato-negativo.png'

VERMELHO = (226, 42, 52)
CLARO = (244, 245, 247)
# Folga mínima do canal vermelho sobre os outros dois para o pixel contar como
# listra da marca. Abaixo disso é desenho, e vira claro.
FOLGA_VERMELHO = 45


def verificar(caminho):
    """Falha se o arquivo não for uma negativa válida da logo."""
    im = Image.open(caminho).convert('RGBA')
    vermelhos = claros = 0
    for r, g, b, a in im.getdata():
        if a == 0:
            continue
        if (r, g, b) == VERMELHO:
            vermelhos += 1
        elif (r, g, b) == CLARO:
            claros += 1
        else:
            raise AssertionError(f'cor inesperada {(r, g, b)} em {caminho.name}')
    assert vermelhos > 20_000, f'listras vermelhas sumiram: {vermelhos}'
    assert claros > 80_000, f'desenho claro sumiu: {claros}'
    assert im.size == (800, 376), im.size
    print(f'ok  {caminho.name}  vermelho={vermelhos}  claro={claros}')


def gerar():
    im = Image.open(ORIGEM).convert('RGBA')
    pixels = im.load()
    largura, altura = im.size
    for y in range(altura):
        for x in range(largura):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            cor = VERMELHO if r - max(g, b) > FOLGA_VERMELHO else CLARO
            pixels[x, y] = (*cor, a)
    im.save(DESTINO)
    return DESTINO


def main():
    if '--verificar-apenas' in sys.argv:
        verificar(pathlib.Path(sys.argv[sys.argv.index('--verificar-apenas') + 1]))
        return
    verificar(gerar())


if __name__ == '__main__':
    main()
