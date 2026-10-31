import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { WhatsAppLink } from '@/components/marketing/WhatsAppLink';

const STEPS = [
  {
    number: '01',
    title: 'Explore',
    text: 'Veja fotos e informações organizadas para encontrar a categoria que faz sentido para você.',
  },
  {
    number: '02',
    title: 'Converse',
    text: 'Chame a equipe pelo WhatsApp com a opção de interesse já identificada na mensagem.',
  },
  {
    number: '03',
    title: 'Avance',
    text: 'Tire dúvidas sobre disponibilidade, compra, venda ou troca diretamente com a loja.',
  },
];

export function Experience() {
  return (
    <>
      <section className="experience section-pad" id="experiencia" aria-labelledby="experience-title">
        <div className="container">
          <div className="section-topline">
            <span className="eyebrow"><span className="eyebrow-line" /> EXPERIÊNCIA LIBERATO</span>
          </div>
          <div className="experience-heading">
            <h2 id="experience-title" className="section-title">
              SIMPLES PARA<br /><span>SEGUIR EM FRENTE.</span>
            </h2>
            <p className="section-intro">
              Um caminho direto entre a descoberta e uma conversa real. O site
              apresenta, organiza e deixa o atendimento a um toque de distância.
            </p>
          </div>
          <div className="steps">
            {STEPS.map((step) => (
              <article className="step" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="trade" aria-labelledby="trade-title">
        <div className="trade-media" aria-hidden="true">
          <Image
            src="/images/yamaha-crosser.png"
            alt=""
            fill
            sizes="(max-width: 700px) 100vw, 60vw"
            className="trade-art"
          />
        </div>
        <div className="container trade-content">
          <p className="eyebrow"><span className="eyebrow-line" /> COMPRA • VENDA • TROCA</p>
          <h2 id="trade-title" className="trade-title">
            SUA PRÓXIMA<br /><span>CONQUISTA</span> COMEÇA<br />NA CONVERSA.
          </h2>
          <p>
            Tem um veículo para trocar ou quer conhecer as opções da loja?
            Fale com a equipe e conte o que você procura.
          </p>
          <WhatsAppLink
            className="button button--red"
            subject="compra, venda ou troca de veículo"
            placement="trade"
          >
            Iniciar conversa <ArrowUpRight size={18} aria-hidden="true" />
          </WhatsAppLink>
        </div>
      </section>
    </>
  );
}
