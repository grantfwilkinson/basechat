"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import Stripe from "stripe";

import { CreditCardInfo } from "@/components/billing/credit-card-info";
import { PaymentMethodsList } from "@/components/billing/payment-methods-list";
import { StripeElementsWrapper } from "@/components/billing/stripe-elements-wrapper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getStripeCustomerDefaultPaymentMethodId,
  listStripeCustomerPaymentMethods,
  setStripeDefaultInvoicePaymentMethod,
} from "@/lib/stripe";

import { PaymentForm } from "./payment-form";

interface Props {
  billingUrl: string;
  publicStripeKey: string;
  paymentMethods: Stripe.PaymentMethod[];
  defaultPaymentMethodId: string | null;
  stripeCustomerId: string;
}

enum DisplayState {
  AddingPaymentMethod = 1,
  ListingPaymentMethods = 2,
  LoadingPaymentMethods = 3,
}

export default function PaymentMethodContent({
  billingUrl,
  paymentMethods: initialPaymentMethods,
  defaultPaymentMethodId: initialDefaultPaymentMethodId,
  publicStripeKey,
  stripeCustomerId,
}: Props) {
  const [paymentMethods, setPaymentMethods] = useState(initialPaymentMethods);
  const [state, setState] = useState<DisplayState>(
    initialPaymentMethods.length === 0 ? DisplayState.AddingPaymentMethod : DisplayState.ListingPaymentMethods,
  );
  const [settingDefaultPaymentMethod, setSettingDefaultPaymentMethod] = useState(false);

  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState(initialDefaultPaymentMethodId);
  const cardPaymentMethods = paymentMethods.filter((paymentMethod) => !!paymentMethod.card);
  const defaultPaymentMethod = cardPaymentMethods.find(
    (cardPaymentMethod) => cardPaymentMethod.id === defaultPaymentMethodId,
  );
  const otherPaymentMethods = cardPaymentMethods.filter(
    (cardPaymentMethod) => cardPaymentMethod.id !== defaultPaymentMethodId,
  );

  const handleSetDefaultPaymentMethod = useCallback(
    async (paymentMethodId: string) => {
      setSettingDefaultPaymentMethod(true);
      try {
        await setStripeDefaultInvoicePaymentMethod(stripeCustomerId, paymentMethodId);
        setDefaultPaymentMethodId(paymentMethodId);
      } catch (err: unknown) {
        toast.error("An unknown error occurred, please try again later");
      } finally {
        setSettingDefaultPaymentMethod(false);
      }
    },
    [stripeCustomerId],
  );

  const handlePaymentMethodAdded = useCallback(async () => {
    setState(DisplayState.LoadingPaymentMethods);

    const newPaymentMethods = await listStripeCustomerPaymentMethods(stripeCustomerId);
    setPaymentMethods(newPaymentMethods);
    const newDefaultPaymentMethodId = await getStripeCustomerDefaultPaymentMethodId(stripeCustomerId);
    setDefaultPaymentMethodId(newDefaultPaymentMethodId);

    setState(DisplayState.ListingPaymentMethods);
  }, [stripeCustomerId]);

  return (
    <div className="w-full p-4 flex-grow flex flex-col">
      <div className="flex w-full justify-between items-center pt-2">
        <h1 className="font-bold text-[32px] text-[#343A40]">Payment Method</h1>
      </div>
      <div className="mt-16">
        <StripeElementsWrapper
          stripePublishableKey={publicStripeKey}
          loadingElement={
            state === DisplayState.AddingPaymentMethod ? <Skeleton className="h-[200px] w-[400px] rounded" /> : <></>
          }
        >
          {state === DisplayState.AddingPaymentMethod && (
            <PaymentForm
              billingUrl={billingUrl}
              stripeCustomerId={stripeCustomerId}
              onPaymentMethodAdded={handlePaymentMethodAdded}
              showCancel={paymentMethods.length !== 0}
              onCancel={() => setState(DisplayState.ListingPaymentMethods)}
            />
          )}
        </StripeElementsWrapper>
        {state === DisplayState.ListingPaymentMethods && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[#74747A] font-semibold">Active payment method</h2>
              <Button
                variant="link"
                className="text-[#364239] hover:text-foreground"
                onClick={() => setState(DisplayState.AddingPaymentMethod)}
              >
                Add credit card
              </Button>
            </div>
            <DefaultPaymentMethod paymentMethod={defaultPaymentMethod} loading={settingDefaultPaymentMethod} />
            {otherPaymentMethods.length > 0 && (
              <>
                <hr className="my-6" />
                <h2 className="text-[#74747A] font-semibold mb-6">Other payment methods</h2>
                <PaymentMethodsList
                  paymentMethods={otherPaymentMethods}
                  handleSetDefaultPaymentMethod={handleSetDefaultPaymentMethod}
                />
              </>
            )}
          </div>
        )}
        {state === DisplayState.LoadingPaymentMethods && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-[40px] w-[500px]" />
            <Skeleton className="h-[40px] w-[500px]" />
            <Skeleton className="h-[40px] w-[500px]" />
            <div className="my-16" />
          </div>
        )}
      </div>
    </div>
  );
}

interface DefaultPaymentMethodProps {
  paymentMethod: Stripe.PaymentMethod | undefined;
  loading?: boolean;
}

function DefaultPaymentMethod({ paymentMethod, loading }: DefaultPaymentMethodProps) {
  if (loading) {
    return <Skeleton className="h-[100px] w-[300px]" />;
  }

  if (!paymentMethod) {
    return <p className="text-muted-foreground">No active payment method</p>;
  }

  if (!paymentMethod.card) {
    return <p className="text-muted-foreground">No active card</p>;
  }

  return (
    <div className="inline-block">
      <CreditCardInfo card={paymentMethod.card} className="bg-card py-2 px-4 rounded-md" />
    </div>
  );
}
